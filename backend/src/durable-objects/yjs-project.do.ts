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
  userId: string;
  username: string;
  email: string;
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
        console.error('JWT signature verification failed');
        return null;
      }

      // Check required fields
      if (!payload.userId || !payload.username) {
        return null;
      }

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        console.error('JWT token expired');
        return null;
      }

      return payload;
    } catch (err) {
      console.error('Failed to verify token:', err);
      return null;
    }
  }

  /**
   * Handle WebSocket upgrade requests
   * Query params: ?documentId=username:slug:docId (or :elements)
   *
   * NOTE: No authentication here - auth happens over the WebSocket connection
   * Client must send JWT token as first text message after connecting
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
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

    // Upgrade to WebSocket
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

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

    console.log(
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
    let sharedDoc = this.documents.get(documentId);

    if (!sharedDoc) {
      // Create new shared doc with persistence
      sharedDoc = new WSSharedDoc();

      // Set up storage-backed persistence for this specific document
      await this.loadDocumentFromStorage(documentId, sharedDoc);

      // Listen to updates and persist them
      sharedDoc.notify((update: Uint8Array) => {
        void this.persistUpdate(documentId, update);
      });

      this.documents.set(documentId, sharedDoc);
      console.log(`Created new shared doc for ${documentId}`);
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
          console.error(`Error sending to WebSocket for ${documentId}:`, error);
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
        console.log(`📤 Sent sync step 1 for ${documentId} (${syncMessage.byteLength} bytes)`);
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
          console.log(`📤 Sent awareness for ${documentId} (${awarenessStates.size} clients)`);
        }
      }
    } catch (error) {
      console.error(`Error sending initial sync state for ${documentId}:`, error);
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
      console.warn('Received message from unknown connection');
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
          console.error(`Invalid auth token for ${connInfo.documentId}`);
          ws.send('access-denied:invalid-token');
          ws.close(4001, 'Invalid token');
          return;
        }

        // Validate project access (document format: username:slug:documentId)
        const parts = connInfo.documentId.split(':');
        const [projectOwner] = parts;

        // Check access - the token's username should match the project owner
        // TODO: Add collaborator support when implemented
        if (sessionData.username !== projectOwner) {
          console.error(
            `User ${sessionData.username} attempted to access project owned by ${projectOwner}`
          );
          ws.send('access-denied:forbidden');
          ws.close(4003, 'Access denied');
          return;
        }

        // Authentication successful!
        connInfo.authenticated = true;
        connInfo.userId = sessionData.userId;
        console.log(`WS authenticated for ${connInfo.documentId} (user: ${sessionData.username})`);

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

        console.log(
          `Yjs sync started for ${connInfo.documentId} (${this.documents.size} docs in DO)`
        );
      } catch (error) {
        console.error(`Auth error for ${connInfo.documentId}:`, error);
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
      console.warn(`No document state for ${connInfo.documentId}`);
      return;
    }

    try {
      // Let the shared doc handle the message
      sharedDoc.update(new Uint8Array(message));
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
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
      console.log(`No connections for project ${this.projectId} - can hibernate`);
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket) {
    console.error(`WebSocket error for project ${this.projectId}`);
    const connInfo = this.connections.get(ws);

    // Unsubscribe from document updates
    if (connInfo && (connInfo as any).unsubscribe) {
      (connInfo as any).unsubscribe();
    }

    this.connections.delete(ws);

    if (connInfo) {
      console.error(`Error was for document: ${connInfo.documentId}`);
    }
  }

  /**
   * Load persisted state for a specific document using y-durableobjects storage pattern
   * Each document gets its own storage namespace
   */
  private async loadDocumentFromStorage(documentId: string, sharedDoc: WSSharedDoc) {
    try {
      const storagePrefix = `doc:${documentId}:`;

      // Use y-durableobjects storage transaction approach
      const updates = await this.state.storage.list<number[]>({
        prefix: `${storagePrefix}update:`,
      });

      if (updates.size > 0) {
        console.log(`📦 Loading ${updates.size} persisted updates for ${documentId}`);

        for (const [_key, updateArray] of updates.entries()) {
          const update = new Uint8Array(updateArray);
          sharedDoc.update(update);
        }

        console.log(`📦 Loaded document ${documentId} from storage`);
      } else {
        console.log(`📦 No persisted updates found for ${documentId} - starting fresh`);
      }
    } catch (error) {
      console.error(`❌ Error loading document ${documentId} from storage:`, error);
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
      console.error(`Error persisting update for ${documentId}:`, error);
    }
  }
}
