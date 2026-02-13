/**
 * Cloudflare Durable Object for Yjs project collaboration
 * Uses y-durableobjects library with multi-document extension
 *
 * Each PROJECT gets one instance that manages ALL documents + elements
 * This dramatically reduces costs vs one DO per document
 *
 * Architecture:
 * - One DO per username:projectSlug
 * - Manages multiple Y.Docs (elements + all open documents)
 * - Routes WebSocket messages based on documentId query param
 * - Uses y-durableobjects for proper Yjs persistence
 *
 * WebSocket Authentication Protocol:
 * - Client connects and sends JWT token as first text message
 * - DO verifies token and project access
 * - DO responds with "authenticated" or "access-denied:reason"
 * - Only after auth does Yjs sync begin
 *
 * Cost savings: 20 open docs = 1 DO instead of 20 = ~20x reduction!
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createEncoder, toUint8Array, writeVarUint, writeVarUint8Array } from 'lib0/encoding';
import { encodeAwarenessUpdate } from 'y-protocols/awareness';
import { writeSyncStep1 } from 'y-protocols/sync';
import { YDurableObjects, WSSharedDoc } from 'y-durableobjects';
import { logger } from '../services/logger.service';

const projDOLog = logger.child('YjsProjectDO');

declare const WebSocketPair: any;

interface ConnectionInfo {
  documentId: string; // Which document this connection is for
  userId?: string;
  authenticated: boolean; // Whether this connection has been authenticated
  sharedDoc?: WSSharedDoc; // Document (only set after auth)
  pendingMessages: ArrayBuffer[]; // Binary messages queued before auth
  unsubscribe?: () => void; // Cleanup function for document subscription
}

interface SessionData {
  // Standard JWT fields (OAuth format)
  sub?: string;
  // Legacy fields
  userId?: string;
  username: string;
  email?: string;
  exp?: number;
}

type YjsEnv = {
  Bindings: {
    DATABASE_KEY?: string;
    SESSION_SECRET?: string;
  };
};

/**
 * Multi-document Yjs Durable Object
 * Extends y-durableobjects to support multiple documents per DO instance
 */
export class YjsProject extends YDurableObjects<YjsEnv> {
  private documents: Map<string, WSSharedDoc> = new Map();
  private connections: Map<WebSocket, ConnectionInfo> = new Map();
  private projectId: string = '';

  /**
   * Get the JWT secret from environment
   */
  private getSecret(): string {
    // Support both DATABASE_KEY (new) and SESSION_SECRET (legacy)
    const secret = this.env.DATABASE_KEY || this.env.SESSION_SECRET;
    projDOLog.debug('getSecret check', {
      hasDatabaseKey: !!this.env.DATABASE_KEY,
      hasSessionSecret: !!this.env.SESSION_SECRET,
      secretLength: secret?.length ?? 0,
    });
    if (!secret || secret.length < 32) {
      throw new Error('DATABASE_KEY must be at least 32 characters');
    }
    return secret;
  }

  /**
   * Verify a JWT token
   * Note: We use a simple base64 decode + HMAC verify approach
   * since hono/jwt is not available in the DO context
   */
  private async verifyToken(token: string): Promise<SessionData | null> {
    try {
      if (!token) return null;

      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const secret = this.getSecret();

      // Decode payload (base64url)
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadJson = atob(payloadB64);
      const payload = JSON.parse(payloadJson) as SessionData;

      // Verify signature using Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(`${parts[0]}.${parts[1]}`);
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      // Decode signature (base64url)
      const sigB64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
      // Pad if needed
      const padded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
      const sigBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
      if (!valid) {
        projDOLog.error('JWT signature verification failed');
        return null;
      }

      // Check required fields - support both OAuth (sub) and legacy (userId) formats
      const userId = payload.sub || payload.userId;
      if (!userId || !payload.username) {
        projDOLog.error('JWT missing required fields', {
          hasUserId: !!userId,
          hasUsername: !!payload.username,
        });
        return null;
      }

      // Normalize to userId for internal use
      payload.userId = userId;

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        projDOLog.error('JWT token expired');
        return null;
      }

      return payload;
    } catch (err) {
      projDOLog.error('Failed to verify token', err);
      return null;
    }
  }

  /**
   * Handle incoming requests - routes to WebSocket or HTTP API
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // Route to WebSocket handler if upgrade requested
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    // Route to HTTP API handlers
    return this.handleHttpApi(request, url);
  }

  /**
   * HTTP API for MCP and other non-WebSocket access to Yjs documents
   * Endpoints:
   * - GET /api/elements?documentId=... - Get elements array
   * - GET /api/document?documentId=... - Get document Y.Map as JSON
   * - POST /api/document?documentId=... - Apply updates to document
   */
  private async handleHttpApi(request: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const method = request.method;
    console.log(`[DO-HTTP] ${method} ${path}`);

    // Verify auth token from header (same as WebSocket auth but via header)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[DO-HTTP] Missing Authorization header');
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    console.log('[DO-HTTP] Verifying token...');
    const session = await this.verifyToken(token);
    if (!session) {
      console.log('[DO-HTTP] Invalid token');
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log('[DO-HTTP] Token verified, user:', session.username);

    // Get documentId from query params
    let documentId = url.searchParams.get('documentId');
    if (!documentId) {
      console.log('[DO-HTTP] Missing documentId parameter');
      return new Response(JSON.stringify({ error: 'Missing documentId parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Normalize documentId
    documentId = documentId.replace(/\/+$/, '');
    console.log('[DO-HTTP] documentId:', documentId);

    // Extract projectId
    const parts = documentId.split(':');
    if (parts.length < 2) {
      console.log('[DO-HTTP] Invalid documentId format');
      return new Response(JSON.stringify({ error: 'Invalid documentId format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    this.projectId = `${parts[0]}:${parts[1]}`;
    console.log('[DO-HTTP] projectId:', this.projectId);

    try {
      // Route based on path and method
      if (path === '/api/elements' && method === 'GET') {
        console.log('[DO-HTTP] Routing to handleGetElements');
        return this.handleGetElements(documentId);
      } else if (path === '/api/elements' && method === 'POST') {
        console.log('[DO-HTTP] Routing to handleMutateElements');
        return this.handleMutateElements(request, documentId);
      } else if (path === '/api/document' && method === 'GET') {
        return this.handleGetDocument(documentId);
      } else if (path === '/api/document' && method === 'POST') {
        return this.handleUpdateDocument(request, documentId);
      } else {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      projDOLog.error('HTTP API error:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * GET /api/elements - Return elements array as JSON
   */
  private async handleGetElements(documentId: string): Promise<Response> {
    console.log('[DO-HTTP] handleGetElements - getting document...');
    const sharedDoc = await this.getOrCreateDocument(documentId);
    console.log('[DO-HTTP] handleGetElements - got document, getting elements array...');
    // WSSharedDoc extends Y.Doc, so sharedDoc IS the doc
    const elementsArray = sharedDoc.getArray('elements');
    console.log('[DO-HTTP] handleGetElements - got elements array, length:', elementsArray.length);

    const elements: Record<string, unknown>[] = [];
    elementsArray.forEach((value) => {
      if (value && typeof value === 'object') {
        elements.push(this.yValueToJson(value));
      }
    });

    // Sort by order
    elements.sort((a, b) => ((a.order as number) ?? 0) - ((b.order as number) ?? 0));

    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /api/elements - Mutate elements array
   * Body: { action: 'replace_all' | 'insert' | 'update' | 'delete', elements?: Element[], element?: Element, elementId?: string, parentId?: string | null }
   */
  private async handleMutateElements(request: Request, documentId: string): Promise<Response> {
    console.log('[DO-HTTP] handleMutateElements - getting document...');
    const sharedDoc = await this.getOrCreateDocument(documentId);
    const elementsArray = sharedDoc.getArray('elements');

    const body = (await request.json()) as {
      action: 'replace_all' | 'insert' | 'update' | 'delete';
      elements?: Record<string, unknown>[];
      element?: Record<string, unknown>;
      elementId?: string;
      position?: number;
    };

    console.log('[DO-HTTP] handleMutateElements - action:', body.action);

    try {
      switch (body.action) {
        case 'replace_all': {
          // Replace all elements with new array
          if (!body.elements || !Array.isArray(body.elements)) {
            return new Response(
              JSON.stringify({ error: 'elements array required for replace_all' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          const elementsToInsert = body.elements;
          sharedDoc.transact(() => {
            elementsArray.delete(0, elementsArray.length);
            elementsArray.insert(0, elementsToInsert);
          });
          break;
        }
        case 'insert': {
          // Insert a single element
          if (!body.element) {
            return new Response(JSON.stringify({ error: 'element required for insert' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const position = body.position ?? elementsArray.length;
          const elementToInsert = body.element;
          sharedDoc.transact(() => {
            elementsArray.insert(position, [elementToInsert]);
          });
          break;
        }
        case 'update': {
          // Update a single element by ID
          if (!body.elementId || !body.element) {
            return new Response(
              JSON.stringify({ error: 'elementId and element required for update' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          const currentElements: Record<string, unknown>[] = [];
          elementsArray.forEach((value) => {
            if (value && typeof value === 'object') {
              currentElements.push(this.yValueToJson(value) as Record<string, unknown>);
            }
          });
          const index = currentElements.findIndex((e) => e.id === body.elementId);
          if (index === -1) {
            return new Response(JSON.stringify({ error: 'Element not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const elementToUpdate = body.element;
          sharedDoc.transact(() => {
            elementsArray.delete(index, 1);
            elementsArray.insert(index, [elementToUpdate]);
          });
          break;
        }
        case 'delete': {
          // Delete a single element by ID
          if (!body.elementId) {
            return new Response(JSON.stringify({ error: 'elementId required for delete' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const currentElements: Record<string, unknown>[] = [];
          elementsArray.forEach((value) => {
            if (value && typeof value === 'object') {
              currentElements.push(this.yValueToJson(value) as Record<string, unknown>);
            }
          });
          const index = currentElements.findIndex((e) => e.id === body.elementId);
          if (index === -1) {
            return new Response(JSON.stringify({ error: 'Element not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          sharedDoc.transact(() => {
            elementsArray.delete(index, 1);
          });
          break;
        }
        default:
          return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
      }

      console.log('[DO-HTTP] handleMutateElements - success');
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('[DO-HTTP] handleMutateElements - error:', error);
      return new Response(JSON.stringify({ error: 'Failed to mutate elements' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * GET /api/document - Return document content as JSON
   */
  private async handleGetDocument(documentId: string): Promise<Response> {
    const sharedDoc = await this.getOrCreateDocument(documentId);

    // Convert all shared types to JSON
    const data: Record<string, unknown> = {};

    // Get common Y.Maps - worldbuilding uses these
    // WSSharedDoc extends Y.Doc, so sharedDoc IS the doc
    const rootMap = sharedDoc.getMap('root');
    if (rootMap.size > 0) {
      data.root = this.yMapToJson(rootMap);
    }

    // Also check for identity map (used by worldbuilding)
    const identityMap = sharedDoc.getMap('identity');
    if (identityMap.size > 0) {
      data.identity = this.yMapToJson(identityMap);
    }

    // Get elements array if present
    const elementsArray = sharedDoc.getArray('elements');
    if (elementsArray.length > 0) {
      const elements: Record<string, unknown>[] = [];
      elementsArray.forEach((value) => {
        if (value && typeof value === 'object') {
          elements.push(this.yValueToJson(value));
        }
      });
      data.elements = elements;
    }

    // Get prosemirror XmlFragment if present (for document content)
    try {
      const xmlFragment = sharedDoc.getXmlFragment('prosemirror');
      if (xmlFragment && xmlFragment.length > 0) {
        data.prosemirror = xmlFragment.toString();
      }
    } catch {
      // XmlFragment doesn't exist yet, that's fine
    }

    // Also get worldbuilding map directly for completeness
    const worldbuildingMap = sharedDoc.getMap('worldbuilding');
    if (worldbuildingMap.size > 0) {
      data.worldbuilding = this.yMapToJson(worldbuildingMap);
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * POST /api/document - Apply updates to document
   * Body: { updates: { path: string, value: any }[] } or { yUpdate: base64 } or { prosemirrorXml: string }
   */
  private async handleUpdateDocument(request: Request, documentId: string): Promise<Response> {
    const sharedDoc = await this.getOrCreateDocument(documentId);
    const body = (await request.json()) as {
      updates?: Array<{ path: string; value: unknown }>;
      yUpdate?: string;
      prosemirrorXml?: string;
    };

    if (body.prosemirrorXml !== undefined) {
      // Replace ProseMirror XmlFragment content with parsed XML
      const xmlFragment = sharedDoc.getXmlFragment('prosemirror');
      const Y = await import('yjs');

      // Parse the XML string into Yjs nodes using a simple parser
      const nodes = this.parseXmlToYjsNodes(Y, body.prosemirrorXml);

      sharedDoc.transact(() => {
        // Clear existing content
        if (xmlFragment.length > 0) {
          xmlFragment.delete(0, xmlFragment.length);
        }
        // Insert new content
        if (nodes.length > 0) {
          xmlFragment.insert(0, nodes);
        }
      });
    } else if (body.yUpdate) {
      // Apply raw Yjs update (base64 encoded)
      const update = Uint8Array.from(atob(body.yUpdate), (c) => c.charCodeAt(0));
      sharedDoc.update(update);
    } else if (body.updates && body.updates.length > 0) {
      // Apply structured updates
      const updates = body.updates;
      // WSSharedDoc extends Y.Doc, so sharedDoc IS the doc
      sharedDoc.transact(() => {
        for (const update of updates) {
          this.applyUpdate(sharedDoc, update.path, update.value);
        }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Missing updates or yUpdate in body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Apply a structured update to a path in the document
   */

  private applyUpdate(doc: any, path: string, value: unknown): void {
    const parts = path.split('.');
    if (parts.length === 0) return;

    // Get or create the root container
    const rootKey = parts[0];
    let container = doc.getMap(rootKey);

    // Navigate to the target, creating intermediate maps as needed
    for (let i = 1; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!container.has(key)) {
        container.set(key, new Map());
      }
      container = container.get(key);
    }

    // Set the final value
    const finalKey = parts[parts.length - 1];
    if (parts.length > 1) {
      container.set(finalKey, value);
    } else {
      // Root level - value should be an object to merge
      if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          container.set(k, v);
        }
      }
    }
  }

  /**
   * Parse a ProseMirror XML string into Yjs XmlElement/XmlText nodes.
   * Handles the simple XML subset used by ProseMirror.
   */

  private parseXmlToYjsNodes(Y: any, xmlString: string): any[] {
    if (!xmlString.trim()) return [];

    const nodes: any[] = [];
    let pos = 0;

    while (pos < xmlString.length) {
      const result = this.parseXmlNode(Y, xmlString, pos);
      if (!result) break;
      if (result.node) nodes.push(result.node);
      if (result.pos <= pos) break;
      pos = result.pos;
    }

    return nodes;
  }

  /**
   * Parse a single XML node (element or text) from the string.
   */

  private parseXmlNode(Y: any, xml: string, pos: number): { node: any | null; pos: number } | null {
    if (pos >= xml.length) return null;

    if (xml[pos] === '<') {
      if (xml.startsWith('<!--', pos)) {
        const end = xml.indexOf('-->', pos + 4);
        return end === -1 ? null : { node: null, pos: end + 3 };
      }
      if (xml[pos + 1] === '/') return null;
      return this.parseXmlElement(Y, xml, pos);
    }

    // Text node
    let end = xml.indexOf('<', pos);
    if (end === -1) end = xml.length;
    const text = this.decodeXmlEntities(xml.substring(pos, end));
    const yText = new Y.XmlText();
    yText.insert(0, text);
    return { node: yText, pos: end };
  }

  /**
   * Parse an XML element with attributes and children.
   */

  private parseXmlElement(Y: any, xml: string, pos: number): { node: any; pos: number } {
    const tagMatch = xml.substring(pos).match(/^<([a-zA-Z_][a-zA-Z0-9_-]*)/);
    if (!tagMatch) {
      // Not a valid tag, treat as text
      let end = xml.indexOf('<', pos + 1);
      if (end === -1) end = xml.length;
      const text = this.decodeXmlEntities(xml.substring(pos, end));
      const yText = new Y.XmlText();
      yText.insert(0, text);
      return { node: yText, pos: end };
    }

    const tagName = tagMatch[1].toLowerCase();
    let cursor = pos + tagMatch[0].length;

    // Parse attributes
    const attrs: Record<string, string> = {};
    while (cursor < xml.length) {
      while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
      if (xml[cursor] === '>' || (xml[cursor] === '/' && xml[cursor + 1] === '>')) break;

      const attrMatch = xml
        .substring(cursor)
        .match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(?:"([^"]*)"|'([^']*)')/);
      if (attrMatch) {
        attrs[attrMatch[1]] = this.decodeXmlEntities(attrMatch[2] ?? attrMatch[3] ?? '');
        cursor += attrMatch[0].length;
      } else {
        cursor++;
      }
    }

    // Self-closing tag
    if (xml[cursor] === '/' && xml[cursor + 1] === '>') {
      const yElement = new Y.XmlElement(tagName);
      for (const [key, value] of Object.entries(attrs)) {
        yElement.setAttribute(key, this.parseXmlAttrValue(value));
      }
      return { node: yElement, pos: cursor + 2 };
    }

    if (xml[cursor] === '>') cursor++;

    // Parse children

    const children: any[] = [];
    const closingTag = `</${tagName}>`;

    while (cursor < xml.length) {
      if (xml.substring(cursor).toLowerCase().startsWith(closingTag)) {
        cursor += closingTag.length;
        break;
      }
      const childResult = this.parseXmlNode(Y, xml, cursor);
      if (!childResult) {
        const closeMatch = xml.substring(cursor).match(/^<\/[a-zA-Z_][a-zA-Z0-9_-]*>/);
        if (closeMatch) cursor += closeMatch[0].length;
        break;
      }
      if (childResult.node) children.push(childResult.node);
      if (childResult.pos <= cursor) break;
      cursor = childResult.pos;
    }

    const yElement = new Y.XmlElement(tagName);
    for (const [key, value] of Object.entries(attrs)) {
      yElement.setAttribute(key, this.parseXmlAttrValue(value));
    }
    if (children.length > 0) yElement.insert(0, children);
    return { node: yElement, pos: cursor };
  }

  /**
   * Parse an XML attribute value to the appropriate type.
   */
  private parseXmlAttrValue(value: string): unknown {
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!isNaN(num) && value !== '') return num;
    return value;
  }

  /**
   * Decode standard XML entities.
   */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
  }

  /**
   * Convert Y.Map to plain JSON
   */

  private yMapToJson(yMap: any): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    yMap.forEach((value: unknown, key: string) => {
      result[key] = this.yValueToJson(value);
    });
    return result;
  }

  /**
   * Convert any Y value to plain JSON
   */
  private yValueToJson(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // Check for Y.Map
    if (typeof value === 'object' && value !== null && 'forEach' in value && '_map' in value) {
      return this.yMapToJson(value);
    }

    // Check for Y.Array
    if (typeof value === 'object' && value !== null && 'forEach' in value && '_start' in value) {
      const arr: unknown[] = [];
      (value as { forEach: (fn: (v: unknown) => void) => void }).forEach((v) => {
        arr.push(this.yValueToJson(v));
      });
      return arr;
    }

    // Plain object
    if (typeof value === 'object' && !Array.isArray(value)) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.yValueToJson(v);
      }
      return result;
    }

    // Array
    if (Array.isArray(value)) {
      return value.map((v) => this.yValueToJson(v));
    }

    // Primitive
    return value;
  }

  /**
   * Handle WebSocket upgrade requests
   * Query params: ?documentId=username:slug:docId (or :elements)
   *
   * NOTE: No authentication here - auth happens over the WebSocket connection
   * Client must send JWT token as first text message after connecting
   */
  private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
    let documentId = url.searchParams.get('documentId');

    if (!documentId) {
      return new Response('Missing documentId parameter', { status: 400 });
    }

    // Remove trailing slashes if present
    documentId = documentId.replace(/\/+$/, '');

    // Extract projectId from documentId (username:slug)
    const parts = documentId.split(':');
    if (parts.length < 2) {
      return new Response('Invalid documentId format', { status: 400 });
    }
    this.projectId = `${parts[0]}:${parts[1]}`;

    const pair = new WebSocketPair();
    const [client, server] = pair;

    // Track connection - NOT authenticated yet, no Yjs setup
    this.connections.set(server, {
      documentId,
      authenticated: false,
      pendingMessages: [],
    });

    // Accept WebSocket with hibernation and tag with documentId
    this.state.acceptWebSocket(server, [documentId]);

    // Note: We do NOT set up Yjs here - we wait for authentication
    // The client must send a JWT token as the first text message

    projDOLog.debug(
      `WS connected: ${documentId}, awaiting authentication... (${this.connections.size} total connections, DO: ${this.projectId})`
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  /**
   * Get or create a document with its own storage namespace
   */
  private async getOrCreateDocument(documentId: string): Promise<WSSharedDoc> {
    console.log('[DO-HTTP] getOrCreateDocument - checking cache for:', documentId);
    let sharedDoc = this.documents.get(documentId);

    if (!sharedDoc) {
      console.log('[DO-HTTP] getOrCreateDocument - not in cache, creating new...');
      // Create new shared doc with persistence
      sharedDoc = new WSSharedDoc();
      console.log('[DO-HTTP] getOrCreateDocument - loading from storage...');

      // Set up storage-backed persistence for this specific document
      await this.loadDocumentFromStorage(documentId, sharedDoc);
      console.log('[DO-HTTP] getOrCreateDocument - loaded from storage');

      // Listen to updates and persist them
      sharedDoc.notify((update: Uint8Array) => {
        void this.persistUpdate(documentId, update);
      });

      this.documents.set(documentId, sharedDoc);
      projDOLog.debug(`Created new shared doc for ${documentId}`);
    }

    return sharedDoc;
  }

  /**
   * Register WebSocket with document-specific message handling
   */
  private registerWebSocketForDocument(ws: WebSocket, sharedDoc: WSSharedDoc, documentId: string) {
    // Subscribe to document updates and send to this WebSocket
    const unsubscribe = sharedDoc.notify((message: Uint8Array) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          projDOLog.error(`Error sending to WebSocket for ${documentId}:`, error);
        }
      }
    });

    // Store unsubscribe function for cleanup
    const connInfo = this.connections.get(ws);
    if (connInfo) {
      (connInfo as any).unsubscribe = unsubscribe;
    }

    // Send initial sync state to the new client
    // This triggers the Yjs sync protocol to exchange document state
    this.sendInitialSyncState(ws, sharedDoc, documentId);
  }

  /**
   * Send initial sync state to a newly connected client
   * This is critical for syncing existing document state to new clients
   * Implements the y-protocols sync step 1 handshake
   */
  private sendInitialSyncState(ws: WebSocket, sharedDoc: WSSharedDoc, documentId: string): void {
    try {
      // Message type constants (matching y-durableobjects)
      const MESSAGE_SYNC = 0;
      const MESSAGE_AWARENESS = 1;

      // Send sync step 1 - this tells the client what state we have
      // and triggers the client to send us any updates we're missing
      {
        const encoder = createEncoder();
        writeVarUint(encoder, MESSAGE_SYNC);
        writeSyncStep1(encoder, sharedDoc);
        const syncMessage = toUint8Array(encoder);
        ws.send(syncMessage);
        projDOLog.debug(`📤 Sent sync step 1 for ${documentId} (${syncMessage.byteLength} bytes)`);
      }

      // Send awareness state
      {
        const awarenessStates = sharedDoc.awareness.getStates();
        if (awarenessStates.size > 0) {
          const encoder = createEncoder();
          writeVarUint(encoder, MESSAGE_AWARENESS);
          const awarenessUpdate = encodeAwarenessUpdate(
            sharedDoc.awareness,
            Array.from(awarenessStates.keys())
          );
          writeVarUint8Array(encoder, awarenessUpdate);
          ws.send(toUint8Array(encoder));
          projDOLog.debug(`📤 Sent awareness for ${documentId} (${awarenessStates.size} clients)`);
        }
      }
    } catch (error) {
      projDOLog.error(`Error sending initial sync state for ${documentId}:`, error);
    }
  }

  /**
   * Handle incoming WebSocket messages
   * Text messages: Authentication (first message must be JWT token)
   * Binary messages: Yjs sync protocol (only after auth)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const connInfo = this.connections.get(ws);
    if (!connInfo) {
      projDOLog.warn('Received message from unknown connection');
      return;
    }

    // Handle text messages (authentication)
    if (typeof message === 'string') {
      if (connInfo.authenticated) {
        // Already authenticated, ignore text messages
        return;
      }

      // First text message should be the JWT token
      const token = message;

      try {
        // Verify the token
        const sessionData = await this.verifyToken(token);
        if (!sessionData) {
          projDOLog.error(`Invalid auth token for ${connInfo.documentId}`);
          ws.send('access-denied:invalid-token');
          ws.close(4001, 'Invalid token');
          return;
        }

        // Validate project access (document format: username:slug:documentId)
        const parts = connInfo.documentId.split(':');
        const [projectOwner] = parts;

        // Check access - the token's username should match the project owner
        // TODO: Add collaborator support - this requires D1 access from the DO
        // For now, collaborators can only work on the Bun runtime, not Cloudflare Workers
        // See yjs.routes.ts for the Bun implementation with collaborationService.checkAccess()
        if (sessionData.username !== projectOwner) {
          projDOLog.error(
            `User ${sessionData.username} attempted to access project owned by ${projectOwner}`
          );
          ws.send('access-denied:forbidden');
          ws.close(4003, 'Access denied');
          return;
        }

        // Authentication successful!
        connInfo.authenticated = true;
        connInfo.userId = sessionData.userId;
        projDOLog.debug(
          `WS authenticated for ${connInfo.documentId} (user: ${sessionData.username})`
        );

        // Send success message
        ws.send('authenticated');

        // Now set up Yjs connection
        const sharedDoc = await this.getOrCreateDocument(connInfo.documentId);
        connInfo.sharedDoc = sharedDoc;
        this.registerWebSocketForDocument(ws, sharedDoc, connInfo.documentId);

        // Process any binary messages that arrived during auth
        for (const data of connInfo.pendingMessages) {
          sharedDoc.update(new Uint8Array(data));
        }
        connInfo.pendingMessages = [];

        projDOLog.debug(
          `Yjs sync started for ${connInfo.documentId} (${this.documents.size} docs in DO)`
        );
      } catch (error) {
        projDOLog.error(`Auth error for ${connInfo.documentId}:`, error);
        ws.send('access-denied:error');
        ws.close(4000, 'Authentication error');
      }

      return;
    }

    // Handle binary messages (Yjs sync protocol)
    if (!connInfo.authenticated) {
      // Not authenticated yet - queue the message
      connInfo.pendingMessages.push(message);
      return;
    }

    const sharedDoc = connInfo.sharedDoc;
    if (!sharedDoc) {
      projDOLog.warn(`No document state for ${connInfo.documentId}`);
      return;
    }

    try {
      // Let the shared doc handle the message
      sharedDoc.update(new Uint8Array(message));
    } catch (error) {
      projDOLog.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket) {
    const connInfo = this.connections.get(ws);

    // Unsubscribe from document updates
    if (connInfo && (connInfo as any).unsubscribe) {
      (connInfo as any).unsubscribe();
    }

    this.connections.delete(ws);

    // Close WebSocket from server side
    try {
      ws.close(1000, 'Server acknowledged close');
    } catch {
      // Already closed
    }

    const allSockets = this.state.getWebSockets();
    if (allSockets.length === 0) {
      projDOLog.debug(`No connections for project ${this.projectId} - can hibernate`);
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket) {
    projDOLog.error(`WebSocket error for project ${this.projectId}`);
    const connInfo = this.connections.get(ws);

    // Unsubscribe from document updates
    if (connInfo && (connInfo as any).unsubscribe) {
      (connInfo as any).unsubscribe();
    }

    this.connections.delete(ws);

    if (connInfo) {
      projDOLog.error(`Error was for document: ${connInfo.documentId}`);
    }
  }

  /**
   * Load persisted state for a specific document using y-durableobjects storage pattern
   * Each document gets its own storage namespace
   */
  private async loadDocumentFromStorage(documentId: string, sharedDoc: WSSharedDoc) {
    try {
      const storagePrefix = `doc:${documentId}:`;
      console.log(
        '[DO-HTTP] loadDocumentFromStorage - listing storage with prefix:',
        storagePrefix
      );

      // Use y-durableobjects storage transaction approach
      const updates = await this.state.storage.list<number[]>({
        prefix: `${storagePrefix}update:`,
      });
      console.log('[DO-HTTP] loadDocumentFromStorage - found', updates.size, 'updates');

      if (updates.size > 0) {
        projDOLog.debug(`📦 Loading ${updates.size} persisted updates for ${documentId}`);

        for (const [_key, updateArray] of updates.entries()) {
          const update = new Uint8Array(updateArray);
          sharedDoc.update(update);
        }

        projDOLog.debug(`📦 Loaded document ${documentId} from storage`);
      } else {
        projDOLog.debug(`📦 No persisted updates found for ${documentId} - starting fresh`);
      }
    } catch (error) {
      projDOLog.error(`❌ Error loading document ${documentId} from storage:`, error);
    }
  }

  /**
   * Persist a document update to storage
   * Uses document-specific storage namespace
   */
  private async persistUpdate(documentId: string, update: Uint8Array) {
    try {
      const storagePrefix = `doc:${documentId}:`;
      const timestamp = Date.now();
      const key = `${storagePrefix}update:${timestamp}`;

      await this.state.storage.put(key, Array.from(update));
    } catch (error) {
      projDOLog.error(`Error persisting update for ${documentId}:`, error);
    }
  }
}
