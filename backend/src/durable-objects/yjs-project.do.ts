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
 * Cost savings: 20 open docs = 1 DO instead of 20 = ~20x reduction!
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { YDurableObjects, WSSharedDoc } from 'y-durableobjects';

declare const WebSocketPair: any;

interface ConnectionInfo {
  documentId: string; // Which document this connection is for
  userId?: string;
}

type YjsEnv = {
  Bindings: Record<string, never>;
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
   * Handle WebSocket upgrade requests
   * Query params: ?documentId=username:slug:docId (or :elements)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    let documentId = url.searchParams.get('documentId');
    const userId = url.searchParams.get('userId') || undefined;

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

    // Get or create document-specific storage
    const sharedDoc = await this.getOrCreateDocument(documentId);

    // Track connection
    this.connections.set(server, { documentId, userId });

    // Accept WebSocket with hibernation and tag with documentId
    this.state.acceptWebSocket(server, [documentId]);

    // Register the WebSocket with the document-specific handler
    this.registerWebSocketForDocument(server, sharedDoc, documentId);

    console.log(
      `WS connected: ${documentId} (${this.connections.size} total connections, ${this.documents.size} docs, DO instance: ${this.projectId})`
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
  }

  /**
   * Handle incoming WebSocket messages
   * Routes to the correct document based on connection's documentId
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const connInfo = this.connections.get(ws);
    if (!connInfo) {
      console.warn('Received message from unknown connection');
      return;
    }

    const sharedDoc = this.documents.get(connInfo.documentId);
    if (!sharedDoc) {
      console.warn(`No document state for ${connInfo.documentId}`);
      return;
    }

    if (typeof message === 'string') {
      console.warn('Received string message, expected binary');
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
