/**
 * Cloudflare Durable Object for Yjs document collaboration
 * Each document gets its own instance with persistent WebSocket connections
 *
 * Note: This file uses Cloudflare Workers-specific APIs that are only available
 * at runtime in the Workers environment. Type errors are expected during development.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from '../services/logger.service';

const docDOLog = logger.child('YjsDocumentDO');

// Cloudflare Workers types - these are available at runtime but not during development
declare const WebSocketPair: any;
interface DurableObjectState {
  id: any;
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: any): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
  blockConcurrencyWhile(callback: () => Promise<void>): void;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  setWebSocketAutoResponse(ws: WebSocket, request: any): void;
}

// Base DurableObject class
class DurableObject {
  protected ctx: DurableObjectState;
  protected env: any;

  constructor(state: DurableObjectState, env: any) {
    this.ctx = state;
    this.env = env;
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response('Not implemented', { status: 501 });
  }

  async webSocketMessage(_ws: WebSocket, _message: ArrayBuffer | string): Promise<void> {
    // Override in subclass
  }

  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    // Override in subclass
  }

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {
    // Override in subclass
  }
}

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const messageSync = 0;
const messageAwareness = 1;

interface StoredUpdate {
  timestamp: number;
  update: number[]; // Stored as array since Uint8Array doesn't serialize well
}

/**
 * Durable Object that manages a single Yjs document
 * Handles WebSocket connections, syncing, and persistence
 */
export class YjsDocument extends DurableObject {
  private doc: Y.Doc;
  private awareness: awarenessProtocol.Awareness;
  private connections: Map<WebSocket, { userId?: string }>;
  private documentId: string;
  private lastCompaction: number;
  private lastActivityTime: number;
  private messageCount: number;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);

    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.connections = new Map();
    this.documentId = '';
    this.lastCompaction = Date.now();
    this.lastActivityTime = Date.now();
    this.messageCount = 0;

    // Load persisted state on initialization
    this.ctx.blockConcurrencyWhile(async () => {
      await this.loadPersistedState();
    });

    // Set up update persistence
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      // Only persist if this wasn't from storage loading
      if (origin !== 'storage') {
        this.persistUpdate(update).catch((err: any) => {
          docDOLog.error('Error persisting update:', err);
        });
      }
    });

    // Set up awareness cleanup
    this.awareness.on('update', () => {
      this.broadcastAwareness();
    });
  }

  /**
   * Handle incoming HTTP requests (WebSocket upgrades)
   */
  async fetch(request: Request): Promise<Response> {
    // Extract documentId from URL
    const url = new URL(request.url);
    const rawDocumentId = url.searchParams.get('documentId');

    if (!rawDocumentId) {
      return new Response('Missing documentId parameter', { status: 400 });
    }

    // Normalize documentId by removing trailing slash
    this.documentId = rawDocumentId.replace(/\/+$/, '');

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Non-WebSocket requests
    return new Response('Expected WebSocket connection', { status: 400 });
  }

  /**
   * Handle WebSocket upgrade and connection
   * Uses Hibernation API to reduce costs - DO sleeps between messages
   */
  private handleWebSocketUpgrade(request: Request): Response {
    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Get userId from query params
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') || undefined;

    // Accept WebSocket with hibernation support
    // Tag with userId for easy lookup later
    const tags = userId ? ['yjs', `user:${userId}`] : ['yjs'];
    this.ctx.acceptWebSocket(server, tags);

    // Store connection metadata (will be recreated on wake from hibernation)
    this.connections.set(server, { userId });

    // Send initial sync
    this.sendSyncStep1(server);

    // Send current awareness states
    this.sendAwarenessStates(server);

    // Set user awareness if userId provided
    if (userId) {
      this.awareness.setLocalStateField('user', { id: userId });
    }

    docDOLog.debug(`WS connected: ${this.documentId} (${this.connections.size} connections)`);

    // Return the client side of the WebSocket pair
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle WebSocket messages
   * With Hibernation API: DO wakes up, processes message, then sleeps
   * Only charged for active processing time!
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === 'string') {
      docDOLog.warn('Received string message, expected binary');
      return;
    }

    // Track activity for monitoring
    this.messageCount++;
    this.lastActivityTime = Date.now();

    // Log stats periodically (every 100 messages)
    if (this.messageCount % 100 === 0) {
      const estimatedSize = this.estimateMemoryUsage();
      docDOLog.debug(
        `[${this.documentId}] Stats: ${this.messageCount} messages, ` +
          `${this.connections.size} connections, ~${estimatedSize}KB memory`
      );
    }

    try {
      const buffer = new Uint8Array(message);
      const decoder = decoding.createDecoder(buffer);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);

          // Track if doc state changes to determine if we should broadcast
          const beforeLength = Y.encodeStateAsUpdate(this.doc).length;

          syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);

          const afterLength = Y.encodeStateAsUpdate(this.doc).length;

          // Send response if there's content
          const response = encoding.toUint8Array(encoder);
          if (response.length > 1) {
            ws.send(response);
          }

          // If the doc changed, broadcast to other clients
          if (afterLength !== beforeLength) {
            this.broadcastMessage(buffer, ws);
          }

          break;
        }

        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          // Broadcast to other connections
          this.broadcastMessage(buffer, ws);
          break;
        }

        default:
          docDOLog.warn('Unknown message type:', messageType);
      }
    } catch (error) {
      docDOLog.error('Error handling WebSocket message:', error);
    }

    // After this function returns, the Durable Object automatically hibernates
    // until the next message arrives - saving CPU and GB-seconds!
  }

  /**
   * Estimate memory usage (rough calculation for monitoring)
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: Y.Doc binary size + overhead
    const docState = Y.encodeStateAsUpdate(this.doc);
    const docSizeKB = Math.round(docState.length / 1024);

    // Add overhead for connections, awareness, etc (~10KB per connection)
    const overhead = this.connections.size * 10;

    return docSizeKB + overhead;
  }

  /**
   * Handle WebSocket close
   * With Hibernation: DO can fully sleep when no connections remain
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    this.connections.delete(ws);

    // Explicitly close the WebSocket from server side if not already closed
    try {
      ws.close(1000, 'Server acknowledged close');
    } catch {
      // Already closed, ignore
    }

    // Get all WebSockets from Durable Object state (includes hibernated ones)
    const allSockets = this.ctx.getWebSockets();

    if (allSockets.length === 0) {
      docDOLog.debug(`No connections for ${this.documentId} - hibernating`);
      // Durable Object will fully hibernate (zero CPU, minimal memory cost)
      // Persistent data remains in SQLite storage
      // Next connection will wake it up instantly
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    docDOLog.error(`WebSocket error for ${this.documentId}:`, error);
    this.connections.delete(ws);
  }

  /**
   * Send Yjs sync step 1 to a connection
   */
  private sendSyncStep1(ws: WebSocket) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    ws.send(encoding.toUint8Array(encoder));
  }

  /**
   * Send current awareness states to a connection
   */
  private sendAwarenessStates(ws: WebSocket) {
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(awarenessStates.keys()))
      );
      ws.send(encoding.toUint8Array(encoder));
    }
  }

  /**
   * Broadcast awareness updates to all connections
   */
  private broadcastAwareness() {
    const awarenessStates = this.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, Array.from(awarenessStates.keys()))
      );
      const message = encoding.toUint8Array(encoder);
      this.broadcastMessage(message);
    }
  }

  /**
   * Broadcast a message to all connections except sender
   */
  private broadcastMessage(message: Uint8Array, exclude?: WebSocket) {
    this.connections.forEach((_, ws) => {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch (error) {
          docDOLog.error('Error broadcasting message:', error);
        }
      }
    });
  }

  /**
   * Load persisted document state from Durable Object storage
   */
  private async loadPersistedState() {
    try {
      // Load all stored updates
      const updates = await this.ctx.storage.get<StoredUpdate[]>('updates');
      if (updates && updates.length > 0) {
        docDOLog.debug(`Loading ${updates.length} persisted updates for ${this.documentId}`);
        updates.forEach((stored: StoredUpdate) => {
          const update = new Uint8Array(stored.update);
          Y.applyUpdate(this.doc, update);
        });
      }
    } catch (error) {
      docDOLog.error('Error loading persisted state:', error);
    }
  }

  /**
   * Persist a Yjs update to Durable Object storage
   */
  private async persistUpdate(update: Uint8Array) {
    try {
      const updates = (await this.ctx.storage.get<StoredUpdate[]>('updates')) || [];

      // Store update as array (Uint8Array doesn't serialize well)
      updates.push({
        timestamp: Date.now(),
        update: Array.from(update),
      });

      await this.ctx.storage.put('updates', updates);

      // Compact if needed (every hour or every 100 updates)
      const timeSinceLastCompaction = Date.now() - this.lastCompaction;
      if (updates.length > 100 || timeSinceLastCompaction > 3600000) {
        await this.compactUpdates();
      }
    } catch (error) {
      docDOLog.error('Error persisting update:', error);
    }
  }

  /**
   * Compact stored updates by merging them into a single state
   */
  private async compactUpdates() {
    try {
      docDOLog.debug(`Compacting updates for ${this.documentId}`);

      // Get current document state
      const state = Y.encodeStateAsUpdate(this.doc);

      // Replace all updates with single compacted state
      await this.ctx.storage.put('updates', [
        {
          timestamp: Date.now(),
          update: Array.from(state),
        },
      ]);

      this.lastCompaction = Date.now();
      docDOLog.debug(`Compaction complete for ${this.documentId}`);
    } catch (error) {
      docDOLog.error('Error compacting updates:', error);
    }
  }
}
