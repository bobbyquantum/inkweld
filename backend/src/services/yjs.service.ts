// @ts-expect-error - y-leveldb has types but package.json exports aren't properly configured
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { type WebSocket } from 'ws';
import { fileStorageService } from './file-storage.service';
import * as path from 'node:path';
import { type Element, type ElementType } from '../schemas/element.schemas';
import { logger } from './logger.service';

const yjsLog = logger.child('Yjs');

const messageSync = 0;
const messageAwareness = 1;

/** Convert a non-null value to a string without producing '[object Object]'. */
function coerceToString(value: NonNullable<unknown>): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value as number | boolean | bigint);
}

interface WSSharedDoc {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /**
   * Map from each connected WebSocket to the set of awareness client IDs it
   * "controls" (i.e. whose state it broadcast on this connection). Kept in
   * sync via the awareness `update` listener so that on disconnect we can
   * remove exactly the stale client IDs for that socket — otherwise remote
   * peers keep seeing the ghost user until the doc is garbage-collected.
   */
  conns: Map<WebSocket, Set<number>>;
  /** Change listener registered on `doc.awareness` — kept here so cleanup can unregister it. */
  awarenessChangeListener?: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
}

export class YjsService {
  private readonly docs = new Map<string, WSSharedDoc>();
  // Map by project key (username:projectSlug) instead of documentId
  private readonly persistences = new Map<string, LeveldbPersistence>();

  /**
   * Get project key from documentId
   */
  private getProjectKey(documentId: string): string {
    const parts = documentId.split(':');
    if (parts.length < 3) {
      throw new Error(`Invalid documentId format: ${documentId}`);
    }
    // Return username:projectSlug
    return `${parts[0]}:${parts[1]}`;
  }

  /**
   * Get or create a document
   */
  async getDocument(documentId: string): Promise<WSSharedDoc> {
    let doc = this.docs.get(documentId);
    if (!doc) {
      const ydoc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(ydoc);
      // The server itself is not an awareness participant — Yjs creates a
      // default local state, so remove it to avoid broadcasting a phantom
      // client to every peer.
      awareness.setLocalState(null);

      const sharedDoc: WSSharedDoc = {
        name: documentId,
        doc: ydoc,
        awareness,
        conns: new Map(),
      };

      // Track which client IDs each socket is responsible for so we can
      // evict their awareness state on disconnect.
      const onAwarenessChange = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const controlledIds = sharedDoc.conns.get(origin as WebSocket);
        if (controlledIds) {
          for (const clientId of [...added, ...updated]) {
            // Transfer ownership to the current socket so an older connection
            // can't remove this live client's presence during disconnect cleanup.
            for (const [conn, ids] of sharedDoc.conns) {
              if (conn !== origin) {
                ids.delete(clientId);
              }
            }
            controlledIds.add(clientId);
          }
          for (const clientId of removed) controlledIds.delete(clientId);
        }
        // Broadcast the awareness change (including removals) to every other
        // peer so they unmount the ghost user immediately.
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        const changedClients = [...added, ...updated, ...removed];
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder);
        this.broadcastMessage(sharedDoc, message, origin);
      };
      awareness.on('update', onAwarenessChange);
      sharedDoc.awarenessChangeListener = onAwarenessChange;

      // Set up persistence
      await this.setupPersistence(documentId, ydoc);

      doc = sharedDoc;
      this.docs.set(documentId, doc);
    }
    return doc;
  }

  /**
   * Setup LevelDB persistence for a document
   */
  private async setupPersistence(documentId: string, ydoc: Y.Doc) {
    // Parse documentId format: username:projectSlug:docName
    const parts = documentId.split(':');
    if (parts.length < 3) {
      yjsLog.error(`Invalid documentId format: ${documentId}`);
      return;
    }

    const [username, projectSlug] = parts;
    const projectKey = this.getProjectKey(documentId);
    const dbPath = path.join(fileStorageService.getProjectPath(username, projectSlug), '.yjs');

    // Get or create persistence instance for this PROJECT (not per document!)
    let persistence = this.persistences.get(projectKey);

    // Create new persistence if none exists for this project
    if (!persistence) {
      persistence = new LeveldbPersistence(dbPath);
      this.persistences.set(projectKey, persistence);
    }

    // Load existing state from persistence for THIS specific document
    try {
      const persistedState = await persistence.getYDoc(documentId);

      if (persistedState?.store?.clients.size > 0) {
        // Apply persisted state to the document
        const stateVector = Y.encodeStateVector(ydoc);
        const diff = Y.encodeStateAsUpdate(persistedState, stateVector);
        Y.applyUpdate(ydoc, diff);
      }

      // Listen for updates - persist them AND broadcast to connected clients
      ydoc.on('update', async (update: Uint8Array, origin: unknown) => {
        try {
          // Look up persistence by PROJECT KEY, not documentId
          const currentPersistence = this.persistences.get(projectKey);
          if (currentPersistence) {
            await currentPersistence.storeUpdate(documentId, update);
          } else {
            yjsLog.warn(`No persistence available for project ${projectKey}, update not saved`);
          }

          // Broadcast update to all connected WebSocket clients
          // (except the origin if it's a WebSocket connection - they already have it)
          const sharedDoc = this.docs.get(documentId);
          if (sharedDoc && sharedDoc.conns.size > 0) {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);
            this.broadcastMessage(sharedDoc, message, origin);
          }
        } catch (error) {
          yjsLog.error(`Error persisting/broadcasting update for ${documentId}`, error);
        }
      });
    } catch (error) {
      yjsLog.error('Error loading persisted state', error);
    }
  }

  /**
   * Get all elements for a project from its Yjs document
   */
  async getElements(username: string, projectSlug: string): Promise<Element[]> {
    const docId = `${username}:${projectSlug}:elements/`;
    const sharedDoc = await this.getDocument(docId);

    // Elements are stored in a Y.Array named 'elements'
    const elementsArray = sharedDoc.doc.getArray('elements');

    const elements: Element[] = [];
    elementsArray.forEach((value) => {
      if (value && typeof value === 'object') {
        elements.push(this.normalizeElement(value as Record<string, unknown>));
      }
    });

    // Sort by order
    return elements.sort((a, b) => a.order - b.order);
  }

  /**
   * Coerce an unknown value to a primitive string, returning '' for objects or
   * symbols (which cannot be coerced to strings via template literals).
   */
  private coerceFieldString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' || typeof value === 'symbol') return '';
    if (value == null) return '';
    // value is narrowed to number | bigint | boolean here
    return (value as number | bigint | boolean).toString();
  }

  /**
   * Normalize a raw Yjs record into a typed Element with coercion and fallbacks.
   */
  private normalizeElement(elem: Record<string, unknown>): Element {
    return {
      id: this.coerceFieldString(elem.id),
      name: this.coerceFieldString(elem.name),
      type: (elem.type as ElementType) ?? 'ITEM',
      parentId: this.coerceNullableString(elem.parentId),
      order: Number(elem.order ?? 0),
      level: Number(elem.level ?? 0),
      expandable: Boolean(elem.expandable ?? false),
      version: Number(elem.version ?? 1),
      schemaId: this.coerceOptionalString(elem.schemaId),
      metadata: (elem.metadata as Record<string, string>) ?? {},
    };
  }

  /** Coerce a raw value to string, returning null for empty/whitespace-only values. */
  private coerceNullableString(value: unknown): string | null {
    if (value == null) return null;
    const str = coerceToString(value);
    return str.trim() === '' ? null : str;
  }

  /** Coerce a raw value to a trimmed string, returning undefined for empty/missing values. */
  private coerceOptionalString(value: unknown): string | undefined {
    if (value == null) return undefined;
    const str = coerceToString(value);
    return str.trim() === '' ? undefined : str;
  }

  /**
   * Handle WebSocket connection for a document - returns the doc for message handling
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  async handleConnection(ws: any, documentId: string, _userId?: string): Promise<WSSharedDoc> {
    const doc = await this.getDocument(documentId);

    // Add connection
    doc.conns.set(ws, new Set());

    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc.doc);
    ws.send(encoding.toUint8Array(encoder));

    // Send awareness states (user identity is broadcast by the client, not the
    // server — setting it server-side would overwrite clients' own state and
    // leak whichever user connected most recently into everyone's awareness).
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder2 = encoding.createEncoder();
      encoding.writeVarUint(encoder2, messageAwareness);
      encoding.writeVarUint8Array(
        encoder2,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
      );
      ws.send(encoding.toUint8Array(encoder2));
    }

    return doc;
  }

  /**
   * Handle incoming message - call this from WebSocket onMessage handler
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  handleMessage(ws: any, doc: WSSharedDoc, message: Buffer) {
    try {
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc.doc, ws);

          // Send response
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder));
          }
          break;
        }

        case messageAwareness:
          // applyAwarenessUpdate triggers the `update` listener installed in
          // getDocument(), which both tracks controlled client IDs for this
          // socket and broadcasts to peers — so we must NOT double-broadcast
          // here.
          awarenessProtocol.applyAwarenessUpdate(
            doc.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          break;
      }
    } catch (error) {
      yjsLog.error('Error handling message', error);
    }
  }

  /**
   * Handle disconnection - call this from WebSocket onClose handler
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  handleDisconnect(ws: any, doc: WSSharedDoc) {
    // Remove awareness states controlled by this socket so other peers stop
    // seeing the disconnected user. Without this, refreshing a tab stacks up
    // ghost presence indicators for each previous connection.
    const controlledIds = doc.conns.get(ws);
    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    }
    doc.conns.delete(ws);

    // Clean up document if no more connections
    if (doc.conns.size === 0) {
      // Keep document in memory for 1 minute after last disconnect
      setTimeout(async () => {
        if (doc.conns.size === 0) {
          if (doc.awarenessChangeListener) {
            doc.awareness.off('update', doc.awarenessChangeListener);
            doc.awarenessChangeListener = undefined;
          }
          doc.awareness.destroy();
          doc.doc.destroy();
          this.docs.delete(doc.name);
          yjsLog.debug(`Document ${doc.name} cleaned up after inactivity`);

          // Check if there are any other documents from the same project still active
          const projectKey = this.getProjectKey(doc.name);
          const hasOtherDocsFromProject = Array.from(this.docs.keys()).some(
            (docId) => this.getProjectKey(docId) === projectKey
          );

          // Only close persistence if NO documents from this project are active
          if (!hasOtherDocsFromProject) {
            const persistence = this.persistences.get(projectKey);
            if (persistence) {
              try {
                await persistence.destroy();
                this.persistences.delete(projectKey);
                yjsLog.debug(`Closed LevelDB persistence for project ${projectKey}`);
              } catch (error) {
                yjsLog.error(`Error closing persistence for project ${projectKey}`, error);
              }
            }
          }
        }
      }, 60000);
    }
  }

  /**
   * Broadcast message to all connections except sender
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  private broadcastMessage(doc: WSSharedDoc, message: Uint8Array, exclude?: any) {
    doc.conns.forEach((_, conn) => {
      if (conn !== exclude) {
        try {
          conn.send(message);
        } catch (error) {
          yjsLog.error('Error broadcasting message', error);
        }
      }
    });
  }

  /**
   * Close all connections and cleanup
   */
  async cleanup() {
    // Close all WebSocket connections
    this.docs.forEach((doc) => {
      doc.conns.forEach((_, ws) => {
        try {
          ws.close();
        } catch (error) {
          yjsLog.error('Error closing WebSocket', error);
        }
      });
      if (doc.awarenessChangeListener) {
        doc.awareness.off('update', doc.awarenessChangeListener);
      }
      doc.awareness.destroy();
      doc.doc.destroy();
    });

    // Close all persistence connections (one per project)
    const persistenceCleanups = Array.from(this.persistences.entries()).map(
      async ([projectKey, persistence]) => {
        try {
          await persistence.destroy();
          yjsLog.debug(`Closed persistence for project ${projectKey}`);
        } catch (error) {
          yjsLog.error(`Error closing persistence for project ${projectKey}`, error);
        }
      }
    );

    await Promise.all(persistenceCleanups);

    this.docs.clear();
    this.persistences.clear();
  }

  /**
   * Rename a project - updates in-memory maps and persistence paths
   * Note: The actual directory rename is done by fileStorageService.renameProjectDirectory
   * This method handles the in-memory Yjs document and persistence references
   */
  async renameProject(username: string, oldSlug: string, newSlug: string): Promise<void> {
    const oldProjectKey = `${username}:${oldSlug}`;
    const newProjectKey = `${username}:${newSlug}`;

    yjsLog.info(`Renaming project: ${oldProjectKey} -> ${newProjectKey}`);

    // Close any active persistence for the old project
    const oldPersistence = this.persistences.get(oldProjectKey);
    if (oldPersistence) {
      try {
        await oldPersistence.destroy();
        this.persistences.delete(oldProjectKey);
        yjsLog.debug(`Closed old persistence for ${oldProjectKey}`);
      } catch (error) {
        yjsLog.error(`Error closing old persistence for ${oldProjectKey}`, error);
      }
    }

    // Close any documents from the old project and remove from map
    const docsToRemove: string[] = [];
    this.docs.forEach((doc, docId) => {
      if (this.getProjectKey(docId) === oldProjectKey) {
        // Close all connections
        doc.conns.forEach((_, ws) => {
          try {
            ws.close(1000, 'Project renamed');
          } catch (error) {
            yjsLog.error('Error closing WebSocket during rename', error);
          }
        });
        if (doc.awarenessChangeListener) {
          doc.awareness.off('update', doc.awarenessChangeListener);
        }
        doc.awareness.destroy();
        doc.doc.destroy();
        docsToRemove.push(docId);
      }
    });

    for (const docId of docsToRemove) {
      this.docs.delete(docId);
    }

    yjsLog.info(`Project rename complete: ${oldProjectKey} -> ${newProjectKey}`);
  }
}

// Create singleton instance
export const yjsService = new YjsService();
