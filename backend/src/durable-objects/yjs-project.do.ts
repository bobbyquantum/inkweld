/**
 * Cloudflare Durable Object for Yjs project collaboration
 * Uses y-durableobjects WSSharedDoc primitives with a custom multi-document DO
 *
 * Each PROJECT gets one instance that manages ALL documents + elements
 * This dramatically reduces costs vs one DO per document
 *
 * Architecture:
 * - One DO per username:projectSlug
 * - Manages multiple Y.Docs (elements + all open documents)
 * - Routes WebSocket messages based on documentId query param
 * - Uses WSSharedDoc for Yjs wire-protocol handling
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
import { createDecoder, readVarUint, readVarUint8Array } from 'lib0/decoding';
import { DurableObject } from 'cloudflare:workers';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { writeSyncStep1 } from 'y-protocols/sync';
import { WSSharedDoc } from 'y-durableobjects';
import { logger } from '../services/logger.service';
import { stripTrailingSlashes } from '../utils/string-utils';
import { parseXmlToYjsNodes } from '@inkweld/prosemirror/xml';
import { makeD1Database, type D1DatabaseInstance } from '../db/d1';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { writingSessionService } from '../services/writing-session.service';
import { activityService } from '../services/activity.service';
import { countWords, extractTextContent } from '../mcp/tools/mutation.tools';
import {
  parseDocumentOwner as parseDocumentOwnerUtil,
  parseTrackableElementId as parseTrackableElementIdUtil,
  isYjsFrameBlockedForViewer,
  isElementsDoc,
} from '../utils/yjs-document-utils';

const projDOLog = logger.child('YjsProjectDO');

declare const WebSocketPair: any;

interface ConnectionInfo {
  documentId: string; // Which document this connection is for
  userId?: string;
  username?: string;
  authenticated: boolean; // Whether this connection has been authenticated
  canWrite: boolean; // Resolved from collaboration access; viewers cannot send updates
  sharedDoc?: WSSharedDoc; // Document (only set after auth)
  pendingMessages: ArrayBuffer[]; // Binary messages queued before auth
  unsubscribe?: () => void; // Cleanup function for document subscription
  /**
   * Awareness client IDs this connection "controls" — tracked via the
   * document's awareness `update` listener so we can evict them on
   * disconnect. Without this, refreshing a tab stacks up ghost presence
   * avatars on every other peer's screen.
   */
  awarenessClientIds: Set<number>;
  awarenessListener?: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
  // Writing-session tracking — populated after successful auth, used by the
  // close handler to finalize the session row and emit a `document_edit`
  // activity event when the session has a non-zero word delta. Mirrors the
  // Bun runtime in routes/yjs.routes.ts.
  writingSessionId?: string | null;
  trackedProjectId?: string | null;
  trackedUserId?: string | null;
  trackedElementId?: string | null;
  trackedProjectOwner?: string | null;
  trackedProjectSlug?: string | null;
}

/**
 * Per-WebSocket state persisted via `ws.serializeAttachment()` so it
 * survives Durable Object hibernation. Must stay under 2 KB and be
 * structured-clone safe (no functions, no class instances).
 *
 * Everything else in `ConnectionInfo` (sharedDoc reference, listener
 * closures, awareness client IDs) is rebuilt lazily in
 * `rehydrateConnection()` after a wake.
 */
interface WSAttachment {
  documentId: string;
  authenticated: boolean;
  userId?: string;
  username?: string;
  /** Whether the user has write access (false = viewer/commenter). Persisted
   *  so the DO can enforce read-only after a hibernation wake without a new
   *  DB lookup. */
  canWrite: boolean;
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
    // D1 binding from wrangler.toml — bound at the Worker level, automatically
    // propagated into Durable Objects so we can run drizzle-d1 inside the DO.
    DB?: unknown;
  };
};

const Y_MESSAGE_SYNC = 0;
const Y_MESSAGE_AWARENESS = 1;

/**
 * Multi-document Yjs Durable Object
 */
export class YjsProject extends DurableObject<YjsEnv['Bindings']> {
  private readonly state: DurableObjectState;
  private readonly documents: Map<string, WSSharedDoc> = new Map();
  private readonly connections: Map<WebSocket, ConnectionInfo> = new Map();
  private projectId: string = '';
  /** Per-doc element snapshots used for CRUD activity event diffing. */
  private readonly elementSnapshots: Map<string, Map<string, { name: string; type: string }>> =
    new Map();

  constructor(state: DurableObjectState, env: YjsEnv['Bindings']) {
    super(state, env);
    this.state = state;
  }

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
      const payloadB64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
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
      const sigB64 = parts[2].replaceAll('-', '+').replaceAll('_', '/');
      // Pad if needed
      const padded = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
      const sigBytes = Uint8Array.from(atob(padded), (c) => c.codePointAt(0) ?? 0);

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
    documentId = stripTrailingSlashes(documentId);
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
        const jsonValue = this.yValueToJson(value);
        if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
          elements.push(jsonValue as Record<string, unknown>);
        }
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
          const jsonValue = this.yValueToJson(value);
          if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
            elements.push(jsonValue as Record<string, unknown>);
          }
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

    // Get relationships array if present
    const relationshipsArray = sharedDoc.getArray('relationships');
    if (relationshipsArray.length > 0) {
      const relationships: Record<string, unknown>[] = [];
      relationshipsArray.forEach((value) => {
        if (value && typeof value === 'object') {
          const jsonValue = this.yValueToJson(value);
          if (jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue)) {
            relationships.push(jsonValue as Record<string, unknown>);
          }
        }
      });
      data.relationships = relationships;
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
   *        or { relationships: { action: 'replace' | 'add', items: any[] } }
   */
  private async handleUpdateDocument(request: Request, documentId: string): Promise<Response> {
    const sharedDoc = await this.getOrCreateDocument(documentId);
    const body = (await request.json()) as {
      updates?: Array<{ path: string; value: unknown }>;
      yUpdate?: string;
      prosemirrorXml?: string;
      relationships?: { action: 'replace' | 'add'; items: unknown[] };
    };

    if (body.prosemirrorXml !== undefined) {
      // Replace ProseMirror XmlFragment content with parsed XML
      const xmlFragment = sharedDoc.getXmlFragment('prosemirror');
      const Y = await import('yjs');

      // Parse the XML string into Yjs nodes using the canonical shared parser
      const nodes = parseXmlToYjsNodes(Y, body.prosemirrorXml);

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
      const update = Uint8Array.from(atob(body.yUpdate), (c) => c.codePointAt(0) ?? 0);
      sharedDoc.update(update);
    } else if (body.relationships) {
      // Apply relationship array mutations
      const { action, items } = body.relationships;
      const relationshipsArray = sharedDoc.getArray('relationships');
      if (action === 'replace') {
        sharedDoc.transact(() => {
          if (relationshipsArray.length > 0) {
            relationshipsArray.delete(0, relationshipsArray.length);
          }
          if (items.length > 0) {
            relationshipsArray.insert(0, items);
          }
        });
      } else if (action === 'add') {
        sharedDoc.transact(() => {
          relationshipsArray.push(items);
        });
      } else {
        return new Response(
          JSON.stringify({
            error: `Invalid relationships action: ${String(action)}`,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
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
    const finalKey = parts.at(-1);
    if (parts.length > 1) {
      container.set(finalKey, value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Root level - value should be a plain object to merge
      for (const [k, v] of Object.entries(value)) {
        container.set(k, v);
      }
    }
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
    documentId = stripTrailingSlashes(documentId);

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
      canWrite: false,
      pendingMessages: [],
      awarenessClientIds: new Set(),
    });

    // Persist minimal per-connection state so the DO can hibernate
    // and rehydrate this connection on wake. See WSAttachment + rehydrateConnection().
    const attachment: WSAttachment = {
      documentId,
      authenticated: false,
      canWrite: false,
    };
    server.serializeAttachment(attachment);

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
   * Build a snapshot of the elements array from the Yjs doc.
   * Returns a map of elementId → {name, type}.
   */
  private buildElementSnapshot(
    sharedDoc: WSSharedDoc
  ): Map<string, { name: string; type: string }> {
    const snapshot = new Map<string, { name: string; type: string }>();
    try {
      const arr = sharedDoc.getArray('elements');
      arr.forEach((value) => {
        if (value && typeof value === 'object') {
          const elem = value as Record<string, unknown>;
          const id = typeof elem.id === 'string' ? elem.id : null;
          if (id) {
            snapshot.set(id, {
              name: typeof elem.name === 'string' ? elem.name : '',
              type: typeof elem.type === 'string' ? elem.type : 'ITEM',
            });
          }
        }
      });
    } catch (err) {
      projDOLog.debug(`buildElementSnapshot failed: ${String(err)}`);
    }
    return snapshot;
  }

  /**
   * Attach a Yjs update observer to the elements doc for the first caller;
   * subsequent calls are no-ops (idempotent). On each update, diffs the
   * element array vs the stored snapshot and emits element_created /
   * element_renamed / element_deleted activity events attributed to the
   * WebSocket origin user.
   *
   * @param sharedDoc - the WSSharedDoc (extends Y.Doc) for the elements doc
   * @param documentId - used as the snapshot map key
   * @param projectDbId - DB project id for activity records
   * @param db - D1 database instance
   */
  private watchElementsDocDO(
    sharedDoc: WSSharedDoc,
    documentId: string,
    projectDbId: string,
    db: ReturnType<typeof this.getDb>
  ): void {
    if (!db) return;
    // Idempotent: only attach once per doc lifetime in this DO instance.
    if (this.elementSnapshots.has(documentId)) return;

    this.elementSnapshots.set(documentId, this.buildElementSnapshot(sharedDoc));

    const dbInstance = db;
    sharedDoc.on('update', (_update: Uint8Array, origin: unknown) => {
      // Skip server-originated updates (persistence replay, HTTP mutations).
      // origin is the raw WebSocket for client-sent frames.
      const ws = origin as WebSocket | null;
      if (!ws) return;
      const connInfo = this.connections.get(ws);
      const userId = connInfo?.userId;
      if (!userId) return;

      const prev = this.elementSnapshots.get(documentId) ?? new Map();
      const next = this.buildElementSnapshot(sharedDoc);
      this.elementSnapshots.set(documentId, next);

      void this.emitElementDiffEventsDO(prev, next, projectDbId, userId, dbInstance);
    });
  }

  /**
   * Diff two element snapshots and fire activity events for any changes.
   * Best-effort — failures are logged and swallowed.
   */
  private async emitElementDiffEventsDO(
    prev: Map<string, { name: string; type: string }>,
    next: Map<string, { name: string; type: string }>,
    projectId: string,
    userId: string,
    db: ReturnType<typeof this.getDb>
  ): Promise<void> {
    if (!db) return;
    try {
      for (const [id, nextElem] of next) {
        if (prev.has(id)) {
          const prevElem = prev.get(id)!;
          if (prevElem.name !== nextElem.name) {
            await activityService.record(db, {
              projectId,
              userId,
              eventType: 'element_renamed',
              entityId: id,
              entityName: nextElem.name || null,
              metadata: { oldName: prevElem.name, newName: nextElem.name },
            });
          }
        } else {
          await activityService.record(db, {
            projectId,
            userId,
            eventType: 'element_created',
            entityId: id,
            entityName: nextElem.name || null,
            metadata: { elementType: nextElem.type },
          });
        }
      }
      for (const [id, prevElem] of prev) {
        if (!next.has(id)) {
          await activityService.record(db, {
            projectId,
            userId,
            eventType: 'element_deleted',
            entityId: id,
            entityName: prevElem.name || null,
            metadata: { elementType: prevElem.type },
          });
        }
      }
    } catch (err) {
      projDOLog.error('emitElementDiffEventsDO failed', err, { projectId, userId });
    }
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

      // ============================================================
      // CRITICAL: Disable y-protocols Awareness server-side timers
      // ============================================================
      // The Awareness constructor does two things that block hibernation:
      //
      //   1. Calls `setLocalState({})` so the local clientID has presence.
      //   2. Registers a `setInterval` (every ~3s) that:
      //        a. Renews the local clock every 15s by calling
      //           `setLocalState(getLocalState())`, which fires an
      //           awareness `update` event → broadcast to every connected
      //           client (this is what was producing the "20 outbound
      //           messages per minute" with zero inbound).
      //        b. Reaps stale remote awareness states.
      //
      // Cloudflare's Hibernation API explicitly states that any active
      // `setInterval`/`setTimeout` prevents the DO from being evicted
      // from memory — even if the callback is a no-op. While the timer
      // is alive, billable Duration (GB-s) accrues continuously.
      //
      // The DO has no business publishing its own awareness state
      // (it's not a "user"); it only relays awareness between clients.
      // Stale-state cleanup is handled in `cleanupConnection()` when a
      // socket closes, so we don't need the periodic reaper either.
      //
      // Clearing local state + the interval lets the DO hibernate
      // between client messages and stops the server-originated
      // outbound broadcast loop.
      sharedDoc.awareness.setLocalState(null);
      const checkInterval = (sharedDoc.awareness as unknown as { _checkInterval?: number })
        ._checkInterval;
      if (checkInterval !== undefined) {
        clearInterval(checkInterval);
      }
      // ============================================================

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
   *
   * @param skipInitialSync When true, the y-protocols sync step 1 + awareness
   *   broadcast is suppressed. Used by `rehydrateConnection()` after a
   *   hibernation wake — the client already completed the initial sync
   *   handshake and resending it would cause an unnecessary state echo.
   */
  private registerWebSocketForDocument(
    ws: WebSocket,
    sharedDoc: WSSharedDoc,
    documentId: string,
    options: { skipInitialSync?: boolean } = {}
  ) {
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

    // Store unsubscribe function and register awareness tracker so we can
    // evict this connection's awareness client IDs on disconnect.
    const connInfo = this.connections.get(ws);
    if (connInfo) {
      connInfo.unsubscribe = unsubscribe;
      const awarenessListener = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        if (origin !== ws) return;
        for (const id of added) connInfo.awarenessClientIds.add(id);
        for (const id of updated) connInfo.awarenessClientIds.add(id);
        for (const id of removed) connInfo.awarenessClientIds.delete(id);
      };
      sharedDoc.awareness.on('update', awarenessListener);
      connInfo.awarenessListener = awarenessListener;
    }

    // Send initial sync state to the new client
    // This triggers the Yjs sync protocol to exchange document state
    if (!options.skipInitialSync) {
      this.sendInitialSyncState(ws, sharedDoc, documentId);
    }
  }

  /**
   * Send initial sync state to a newly connected client
   * This is critical for syncing existing document state to new clients
   * Implements the y-protocols sync step 1 handshake
   */
  private sendInitialSyncState(ws: WebSocket, sharedDoc: WSSharedDoc, documentId: string): void {
    try {
      // Send sync step 1 - this tells the client what state we have
      // and triggers the client to send us any updates we're missing
      {
        const encoder = createEncoder();
        writeVarUint(encoder, Y_MESSAGE_SYNC);
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
          writeVarUint(encoder, Y_MESSAGE_AWARENESS);
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
   * Rebuild in-memory ConnectionInfo for a WebSocket after a hibernation
   * wake.
   *
   * Cloudflare evicts the DO from memory between events when WebSockets
   * are accepted via `state.acceptWebSocket()` and no timers / pending I/O
   * are pinning the instance. On the next event the constructor reruns
   * and `this.connections` (plus `this.documents`) are empty — but the
   * runtime preserves the WebSocket objects themselves and any value we
   * stashed via `ws.serializeAttachment()`.
   *
   * This method is idempotent within a single wake cycle: subsequent
   * calls return the cached ConnectionInfo without rebuilding listeners.
   *
   * Returns `null` if the WebSocket has no attachment (which would only
   * happen for a connection accepted before this code shipped, or a
   * malformed handshake — in either case the caller should drop it).
   */
  private async rehydrateConnection(ws: WebSocket): Promise<ConnectionInfo | null> {
    const existing = this.connections.get(ws);
    if (existing) return existing;

    const attachment = ws.deserializeAttachment() as WSAttachment | null;
    if (!attachment?.documentId) {
      projDOLog.warn('Cannot rehydrate WebSocket: missing attachment');
      return null;
    }

    this.restoreProjectIdFromDocumentId(attachment.documentId);

    const connInfo = this.connectionInfoFromAttachment(attachment);
    this.connections.set(ws, connInfo);

    // If this connection had already authenticated before hibernation,
    // re-attach it to the document so outbound broadcasts resume.
    // Awareness state is in-memory only and is rebuilt lazily as clients
    // resend their awareness updates (every ~3s via y-protocols).
    if (connInfo.authenticated) {
      await this.rehydrateAuthenticatedConnection(ws, connInfo);
    }

    return connInfo;
  }

  private restoreProjectIdFromDocumentId(documentId: string): void {
    // Restore projectId from documentId so HTTP API logs and any future
    // logic that reads it stay accurate after a wake.
    const parts = documentId.split(':');
    if (parts.length >= 2) {
      this.projectId = `${parts[0]}:${parts[1]}`;
    }
  }

  private connectionInfoFromAttachment(
    attachment: WSAttachment,
    sharedDoc?: WSSharedDoc
  ): ConnectionInfo {
    return {
      documentId: attachment.documentId,
      userId: attachment.userId,
      username: attachment.username,
      authenticated: attachment.authenticated,
      canWrite: attachment.canWrite,
      pendingMessages: [],
      awarenessClientIds: new Set(),
      sharedDoc,
    };
  }

  private async rehydrateAuthenticatedConnection(
    ws: WebSocket,
    connInfo: ConnectionInfo
  ): Promise<void> {
    try {
      const sharedDoc = await this.getOrCreateDocument(connInfo.documentId);
      this.registerRehydratedSocket(ws, connInfo, sharedDoc);
      this.rehydrateAuthenticatedPeers(ws, connInfo.documentId, sharedDoc);

      projDOLog.debug(
        `🔄 Rehydrated authenticated connection for ${connInfo.documentId} after wake`
      );
    } catch (error) {
      projDOLog.error(`Failed to rehydrate document for ${connInfo.documentId}:`, error);
    }
  }

  private rehydrateAuthenticatedPeers(
    wakingWs: WebSocket,
    documentId: string,
    sharedDoc: WSSharedDoc
  ): void {
    // Cloudflare wakes the DO for a single WS event. Other sockets remain
    // attached but unregistered as listeners, so restore them before the
    // waking socket's update broadcasts.
    for (const peerWs of this.state.getWebSockets()) {
      if (peerWs !== wakingWs) {
        this.rehydrateAuthenticatedPeer(peerWs, documentId, sharedDoc);
      }
    }
  }

  private rehydrateAuthenticatedPeer(
    peerWs: WebSocket,
    documentId: string,
    sharedDoc: WSSharedDoc
  ): void {
    const existing = this.connections.get(peerWs);
    if (existing) {
      this.registerPeerIfDetached(peerWs, existing, documentId, sharedDoc);
      return;
    }

    const attachment = peerWs.deserializeAttachment() as WSAttachment | null;
    if (attachment?.documentId !== documentId || !attachment.authenticated) return;

    const peerInfo = this.connectionInfoFromAttachment(attachment, sharedDoc);
    this.connections.set(peerWs, peerInfo);
    this.registerRehydratedSocket(peerWs, peerInfo, sharedDoc);
  }

  private registerPeerIfDetached(
    peerWs: WebSocket,
    peerInfo: ConnectionInfo,
    documentId: string,
    sharedDoc: WSSharedDoc
  ): void {
    if (peerInfo.documentId !== documentId || peerInfo.sharedDoc) return;
    this.registerRehydratedSocket(peerWs, peerInfo, sharedDoc);
  }

  private registerRehydratedSocket(
    ws: WebSocket,
    connInfo: ConnectionInfo,
    sharedDoc: WSSharedDoc
  ): void {
    connInfo.sharedDoc = sharedDoc;
    // Do NOT resend sync step 1 here: these clients already completed the
    // initial sync before hibernation. Any persisted updates were replayed
    // when the document was loaded.
    this.registerWebSocketForDocument(ws, sharedDoc, connInfo.documentId, {
      skipInitialSync: true,
    });
  }

  /**
   * Handle incoming WebSocket messages
   * Text messages: Authentication (first message must be JWT token)
   * Binary messages: Yjs sync protocol (only after auth)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const connInfo = await this.rehydrateConnection(ws);
    if (!connInfo) {
      projDOLog.warn('Received message from unknown connection');
      try {
        ws.close(4000, 'Unknown connection');
      } catch {
        // already closed
      }
      return;
    }

    // Handle text messages (authentication)
    if (typeof message === 'string') {
      if (connInfo.authenticated) {
        // Already authenticated, ignore text messages
        return;
      }
      await this.handleAuthMessage(ws, connInfo, message);
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
      // Block writes from read-only viewers (commenter / viewer roles).
      if (!connInfo.canWrite && isYjsFrameBlockedForViewer(message)) {
        projDOLog.debug(`Blocked write frame from read-only viewer for ${connInfo.documentId}`);
        return;
      }
      this.applyDocumentMessage(sharedDoc, ws, message);
    } catch (error) {
      projDOLog.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Build a Drizzle-D1 database handle from the DO env binding.
   * Returns null if the DB binding is unavailable (e.g. in tests without
   * a configured wrangler env). Callers should treat that as a soft
   * failure — sync must continue to work even if metadata writes don't.
   */
  private getDb(): D1DatabaseInstance | null {
    if (!this.env.DB) {
      projDOLog.warn('No D1 binding (env.DB) available in DO — auth + session tracking disabled');
      return null;
    }
    return makeD1Database(this.env.DB);
  }

  /**
   * Parse the project owner + slug out of a Yjs document id. Delegates to
   * the shared util so the Bun WS route and DO stay in lockstep.
   */
  private parseDocumentOwner(documentId: string): { projectOwner: string; slug: string } | null {
    return parseDocumentOwnerUtil(documentId);
  }

  /**
   * Extract the trackable elementId from a documentId. Returns null for
   * project-level `elements` docs and `worldbuilding:` docs.
   */
  private parseTrackableElementId(documentId: string): string | null {
    return parseTrackableElementIdUtil(documentId);
  }

  /**
   * Best-effort: read the current word count from a live Yjs shared doc
   * by walking its `prosemirror` XmlFragment.
   *
   * `WSSharedDoc` from `y-durableobjects` extends `Y.Doc` directly, so
   * `getXmlFragment` is available on the instance itself (no `.doc` wrapper).
   */
  private readWordCount(sharedDoc: WSSharedDoc | undefined): number {
    try {
      if (!sharedDoc) return 0;
      const fragment = sharedDoc.getXmlFragment('prosemirror');
      if (!fragment) return 0;
      return countWords(extractTextContent(fragment));
    } catch {
      return 0;
    }
  }

  /**
   * Open a writing session for this connection if the user can write and
   * the document id maps to a trackable element. Failures are swallowed.
   */
  private async tryStartSession(connInfo: ConnectionInfo, projectId: string): Promise<void> {
    try {
      if (!connInfo.canWrite) return;
      if (!connInfo.userId) return;
      const elementId = this.parseTrackableElementId(connInfo.documentId);
      if (!elementId) return;
      const db = this.getDb();
      if (!db) return;

      const startWordCount = this.readWordCount(connInfo.sharedDoc);
      const id = await writingSessionService.start(db, {
        projectId,
        elementId,
        userId: connInfo.userId,
        startWordCount,
      });
      connInfo.writingSessionId = id;
      connInfo.trackedProjectId = projectId;
      connInfo.trackedUserId = connInfo.userId;
      connInfo.trackedElementId = elementId;
      const parsed = this.parseDocumentOwner(connInfo.documentId);
      connInfo.trackedProjectOwner = parsed?.projectOwner ?? null;
      connInfo.trackedProjectSlug = parsed?.slug ?? null;
      projDOLog.debug(
        `Writing session started ${id} for ${connInfo.documentId} (start words: ${startWordCount})`
      );
    } catch (err) {
      projDOLog.error(`Failed to start writing session for ${connInfo.documentId}`, err);
    }
  }

  /**
   * Finalize the writing session on disconnect. Emits a `document_edit`
   * activity event when the session produced a non-zero word delta.
   */
  private async tryFinalizeSession(connInfo: ConnectionInfo): Promise<void> {
    if (!connInfo.writingSessionId) return;
    const id = connInfo.writingSessionId;
    const projectId = connInfo.trackedProjectId;
    const userId = connInfo.trackedUserId;
    const elementId = connInfo.trackedElementId;
    const projectOwner = connInfo.trackedProjectOwner;
    const projectSlug = connInfo.trackedProjectSlug;
    connInfo.writingSessionId = null; // prevent double-finalize
    try {
      const db = this.getDb();
      if (!db) return;
      const endWordCount = this.readWordCount(connInfo.sharedDoc);
      const result = await writingSessionService.finalize(db, id, endWordCount);
      projDOLog.debug(
        `Writing session finalized ${id} for ${connInfo.documentId} (end words: ${endWordCount}, delta: ${result?.wordsDelta ?? 'n/a'})`
      );
      if (result && result.wordsDelta !== 0 && projectId && userId && elementId) {
        // Best-effort element name lookup so the activity feed can show
        // "edited <document name>" instead of just "edited a document".
        let entityName: string | null = null;
        if (projectOwner && projectSlug) {
          try {
            const elementsDoc = await this.getOrCreateDocument(
              `${projectOwner}:${projectSlug}:elements/`
            );
            const arr = elementsDoc.getArray('elements');
            arr.forEach((value) => {
              if (
                entityName === null &&
                value &&
                typeof value === 'object' &&
                (value as Record<string, unknown>).id === elementId
              ) {
                const name = (value as Record<string, unknown>).name;
                if (typeof name === 'string') entityName = name;
              }
            });
          } catch (err) {
            projDOLog.debug(
              `Failed to resolve element name for ${elementId} in ${projectOwner}/${projectSlug}: ${String(err)}`
            );
          }
        }
        await activityService.recordOrCoalesceEdit(db, {
          projectId,
          userId,
          entityId: elementId,
          entityName,
          wordsDelta: result.wordsDelta,
          endWordCount,
          durationMs: result.durationMs,
        });
      }
    } catch (err) {
      projDOLog.error(`Failed to finalize writing session ${id} for ${connInfo.documentId}`, err);
    }
  }

  /**
   * Check project access using the D1 database (full collaboration support).
   * Returns `{ canWrite, projectDbId }` or null if access was denied (response already sent).
   */
  private async checkAccessWithDb(
    db: D1DatabaseInstance,
    parsed: { projectOwner: string; slug: string },
    sessionData: SessionData,
    ws: WebSocket
  ): Promise<{ canWrite: boolean; projectDbId: string } | null> {
    const project = await projectService.findByUsernameAndSlug(
      db,
      parsed.projectOwner,
      parsed.slug
    );
    if (!project) {
      projDOLog.warn(`Project not found: ${parsed.projectOwner}/${parsed.slug}`);
      ws.send('access-denied:project-not-found');
      ws.close(4003, 'Project not found');
      return null;
    }

    const jwtUserId = sessionData.userId ?? sessionData.sub;
    if (project.userId === jwtUserId) {
      return { canWrite: true, projectDbId: project.id };
    }

    const access = await collaborationService.checkAccess(db, project.id, jwtUserId);
    if (!access.canRead) {
      projDOLog.warn(
        `User ${sessionData.username} attempted to access project ${parsed.projectOwner}/${parsed.slug}`
      );
      ws.send('access-denied:forbidden');
      ws.close(4003, 'Access denied');
      return null;
    }

    projDOLog.info(
      `Collaborator ${sessionData.username} (${access.role}, canWrite: ${access.canWrite}) accessing ${parsed.projectOwner}/${parsed.slug}`
    );
    return { canWrite: access.canWrite, projectDbId: project.id };
  }

  /**
   * Legacy owner-only access check for deployments without a D1 binding.
   * Returns `{ canWrite, projectDbId }` or null if access was denied (response already sent).
   */
  private checkAccessLegacy(
    parsed: { projectOwner: string },
    sessionData: SessionData,
    ws: WebSocket
  ): { canWrite: boolean; projectDbId: null } | null {
    if (sessionData.username !== parsed.projectOwner) {
      projDOLog.error(
        `User ${sessionData.username} attempted to access project owned by ${parsed.projectOwner}`
      );
      ws.send('access-denied:forbidden');
      ws.close(4003, 'Access denied');
      return null;
    }
    return { canWrite: true, projectDbId: null };
  }

  /**
   * Verify the JWT token from a connection's first text message and, if
   * valid, transition the connection to authenticated and start Yjs sync.
   *
   * Extracted from webSocketMessage to keep cognitive complexity in check.
   */
  private async handleAuthMessage(
    ws: WebSocket,
    connInfo: ConnectionInfo,
    token: string
  ): Promise<void> {
    try {
      const sessionData = await this.verifyToken(token);
      if (!sessionData) {
        projDOLog.error(`Invalid auth token for ${connInfo.documentId}`);
        ws.send('access-denied:invalid-token');
        ws.close(4001, 'Invalid token');
        return;
      }

      // Validate project access. Replaces the legacy owner-only check with a
      // real collaboration lookup so collaborators (editor/commenter/viewer)
      // can sync via the Cloudflare Durable Object runtime. Mirrors
      // routes/yjs.routes.ts (Bun reference impl).
      const parsed = this.parseDocumentOwner(connInfo.documentId);
      if (!parsed) {
        projDOLog.error(`Invalid documentId format: ${connInfo.documentId}`);
        ws.send('access-denied:invalid-document');
        ws.close(4002, 'Invalid document ID');
        return;
      }

      const db = this.getDb();
      const accessResult = db
        ? await this.checkAccessWithDb(db, parsed, sessionData, ws)
        : this.checkAccessLegacy(parsed, sessionData, ws);
      if (!accessResult) return;
      const { canWrite, projectDbId } = accessResult;

      // Authentication successful!
      connInfo.authenticated = true;
      connInfo.userId = sessionData.userId ?? sessionData.sub;
      connInfo.username = sessionData.username;
      connInfo.canWrite = canWrite;

      // Persist the new authenticated state (including canWrite) so a
      // hibernation wake will re-attach this socket without a new DB lookup.
      const attachment: WSAttachment = {
        documentId: connInfo.documentId,
        authenticated: true,
        userId: connInfo.userId,
        username: connInfo.username,
        canWrite,
      };
      ws.serializeAttachment(attachment);

      projDOLog.debug(
        `WS authenticated for ${connInfo.documentId} (user: ${sessionData.username}, canWrite: ${canWrite})`
      );

      // Send success message
      ws.send('authenticated');

      // Now set up Yjs connection
      const sharedDoc = await this.getOrCreateDocument(connInfo.documentId);
      connInfo.sharedDoc = sharedDoc;
      this.registerWebSocketForDocument(ws, sharedDoc, connInfo.documentId);

      // Open a writing session for this connection (best-effort).
      if (projectDbId) {
        await this.tryStartSession(connInfo, projectDbId);
      }

      // If this is the elements doc, attach the snapshot-diff observer so
      // element creates/renames/deletes are recorded as activity events.
      if (db && projectDbId && isElementsDoc(connInfo.documentId)) {
        this.watchElementsDocDO(sharedDoc, connInfo.documentId, projectDbId, db);
      }

      // Process any binary messages that arrived during auth
      for (const data of connInfo.pendingMessages) {
        this.applyDocumentMessage(sharedDoc, ws, data);
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
  }

  /**
   * Dispatch a client frame to the shared document.
   *
   * y-durableobjects applies awareness messages with `origin = null`, which
   * prevents our per-socket awareness bookkeeping from tracking client IDs.
   * We decode awareness messages here and apply them with `origin = ws` so
   * disconnect cleanup can correctly evict that socket's awareness states.
   */
  private applyDocumentMessage(sharedDoc: WSSharedDoc, ws: WebSocket, data: ArrayBuffer): void {
    const message = new Uint8Array(data);
    const decoder = createDecoder(message);
    const messageType = readVarUint(decoder);

    if (messageType === Y_MESSAGE_AWARENESS) {
      applyAwarenessUpdate(sharedDoc.awareness, readVarUint8Array(decoder), ws);
      return;
    }

    sharedDoc.update(message);
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket) {
    // Rehydrate so the cleanup path can find the connection even if the
    // DO hibernated between the upgrade and the close event.
    await this.rehydrateConnection(ws);

    // Finalize the writing session BEFORE cleanup so we read the final word
    // count while the doc is still in connInfo. Fire-and-forget.
    const connInfo = this.connections.get(ws);
    if (connInfo) {
      void this.tryFinalizeSession(connInfo);
    }

    this.cleanupConnection(ws);

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
    await this.rehydrateConnection(ws);
    const connInfo = this.connections.get(ws);
    if (connInfo) {
      projDOLog.error(`Error was for document: ${connInfo.documentId}`);
      void this.tryFinalizeSession(connInfo);
    }
    this.cleanupConnection(ws);
  }

  /**
   * Shared teardown used by both close and error paths: unsubscribes from
   * document updates, removes awareness states controlled by this socket so
   * remote peers drop the ghost user, and purges our tracking map.
   */
  private cleanupConnection(ws: WebSocket): void {
    const connInfo = this.connections.get(ws);
    if (!connInfo) return;

    connInfo.unsubscribe?.();

    if (connInfo.sharedDoc) {
      if (connInfo.awarenessListener) {
        connInfo.sharedDoc.awareness.off('update', connInfo.awarenessListener);
      }
      if (connInfo.awarenessClientIds.size > 0) {
        removeAwarenessStates(
          connInfo.sharedDoc.awareness,
          Array.from(connInfo.awarenessClientIds),
          null
        );
      }
    }

    this.connections.delete(ws);
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
