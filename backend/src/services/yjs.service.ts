import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { type WebSocket } from 'ws';
import { fileStorageService } from './file-storage.service';
import * as path from 'node:path';
import { type Element, type ElementType } from '../types/element.types';
import { logger } from './logger.service';
import { activityService } from './activity.service';
import type { DatabaseInstance } from '../types/context';

const yjsLog = logger.child('Yjs');

/**
 * The subset of `y-leveldb`'s LeveldbPersistence this service uses. Typed
 * structurally because the package's `exports` don't expose its types cleanly.
 */
interface LeveldbPersistence {
  getYDoc(docName: string): Promise<Y.Doc>;
  storeUpdate(docName: string, update: Uint8Array): Promise<unknown>;
  /**
   * Merge all stored incremental updates for a document into a single row and
   * clear the prior range (`y-leveldb`). Keeps on-disk storage proportional to
   * document content instead of full edit history.
   */
  flushDocument(docName: string): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Lazily import `y-leveldb` on first use. This service only persists via
 * LevelDB on the Bun/Node runtime, but the module is also pulled into the
 * Cloudflare Worker bundle — a top-level import initialised the whole LevelDB
 * dependency chain inside the Worker at startup (and, as a side effect, made
 * lib0's singleton error stacks point at the y-leveldb import chain, which is
 * how it ended up as a red herring in DO "corrupted snapshot" logs). Deferring
 * the import means the Worker never initialises any of it.
 */
let leveldbCtorPromise: Promise<new (location: string) => LeveldbPersistence> | null = null;
function loadLeveldbPersistence(): Promise<new (location: string) => LeveldbPersistence> {
  // @ts-expect-error - y-leveldb has types but package.json exports aren't properly configured
  leveldbCtorPromise ??= import('y-leveldb').then(
    (mod: { LeveldbPersistence: new (location: string) => LeveldbPersistence }) =>
      mod.LeveldbPersistence
  );
  return leveldbCtorPromise;
}

const messageSync = 0;
const messageAwareness = 1;

/**
 * Incremental update rows stored per document before a LevelDB compaction
 * (`flushDocument`) is triggered. Matches the Durable Object path's
 * `COMPACT_THRESHOLD` so both runtimes bound storage the same way. Local to
 * this file — importing from `durable-objects/` would pull the Worker-side
 * module into the Bun bundle (see `loadLeveldbPersistence`).
 */
export const LEVELDB_COMPACT_THRESHOLD = 50;

/**
 * Lightweight snapshot of a single element used for diffing before/after
 * each Yjs update on the `elements/` shared doc.
 */
interface ElementSnapshot {
  name: string;
  type: string;
}

/** Convert a non-null value to a string without producing '[object Object]'. */
export function coerceToString(value: NonNullable<unknown>): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
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
  /**
   * Maps each authenticated WebSocket to the userId that owns it. Populated
   * after a successful auth handshake so the update listener can attribute
   * element-CRUD activity events to the correct user.
   */
  wsUserIds: Map<WebSocket, string>;
  /**
   * Last-known snapshot of the elements array (only populated for `elements/`
   * documents). Keyed by element id; used to diff creates/renames/deletes.
   */
  elementSnapshot?: Map<string, ElementSnapshot>;
}

export class YjsService {
  private readonly docs = new Map<string, WSSharedDoc>();
  // Map by project key (username:projectSlug) instead of documentId
  private readonly persistences = new Map<string, LeveldbPersistence>();
  private readonly persistFailures = new Map<string, number>();
  /**
   * Per-document count of incremental updates persisted since the last
   * LevelDB compaction. When a document reaches `LEVELDB_COMPACT_THRESHOLD`
   * a `flushDocument` compaction is fired and the counter resets immediately
   * (optimistic, mirroring the Durable Object path), so exactly one flush is
   * in flight per burst; a failed flush defers compaction to the next batch —
   * incremental rows remain intact and `getYDoc`'s load-time trim (>500 rows)
   * is the backstop.
   */
  private readonly pendingSinceCompact = new Map<string, number>();

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
        wsUserIds: new Map(),
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
      const LeveldbPersistenceCtor = await loadLeveldbPersistence();
      persistence = new LeveldbPersistenceCtor(dbPath);
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

      // Listen for updates - broadcast to connected clients AND persist.
      // Broadcast runs first (synchronous, always safe — the update is already
      // applied to the in-memory Y.Doc) so live collaboration continues even
      // during a LevelDB outage.
      ydoc.on('update', async (update: Uint8Array, origin: unknown) => {
        const sharedDoc = this.docs.get(documentId);
        if (sharedDoc && sharedDoc.conns.size > 0) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.writeUpdate(encoder, update);
          const message = encoding.toUint8Array(encoder);
          this.broadcastMessage(sharedDoc, message, origin);
        }

        try {
          const currentPersistence = this.persistences.get(projectKey);
          if (currentPersistence) {
            await currentPersistence.storeUpdate(documentId, update);
            const prevFailures = this.persistFailures.get(documentId);
            if (prevFailures) {
              yjsLog.info(
                `LevelDB persistence recovered for ${documentId} after ${prevFailures} failures`
              );
              this.persistFailures.delete(documentId);
            }
            // Fire-and-forget compaction: merge the accumulated incremental
            // rows into one so on-disk size tracks content, not edit history.
            // The counter resets before firing (optimistic, like the DO path)
            // so a burst triggers exactly one flush; y-leveldb's transaction
            // chain serializes it against concurrent storeUpdates, and a
            // rejection only defers compaction to the next batch.
            const pending = (this.pendingSinceCompact.get(documentId) ?? 0) + 1;
            if (pending >= LEVELDB_COMPACT_THRESHOLD) {
              this.pendingSinceCompact.set(documentId, 0);
              void currentPersistence.flushDocument(documentId).then(
                () => yjsLog.debug(`Compacted LevelDB updates for ${documentId}`),
                (error: unknown) => {
                  yjsLog.warn(
                    `LevelDB compaction failed for ${documentId} — deferring to the next batch`,
                    error
                  );
                }
              );
            } else {
              this.pendingSinceCompact.set(documentId, pending);
            }
          } else {
            yjsLog.warn(`No persistence available for project ${projectKey}, update not saved`);
          }
        } catch (error) {
          const count = (this.persistFailures.get(documentId) ?? 0) + 1;
          this.persistFailures.set(documentId, count);
          if (count === 1 || count % 10 === 0) {
            yjsLog.error(
              `LevelDB persist failure #${count} for ${documentId} — updates are in-memory only and will be lost on restart`,
              error
            );
          }
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
   * Associate an authenticated userId with a WebSocket on the given document.
   * Called after a successful auth handshake so update listeners can attribute
   * element-CRUD mutations to the correct user.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  registerUserConnection(ws: any, documentId: string, userId: string): void {
    const doc = this.docs.get(documentId);
    if (doc) doc.wsUserIds.set(ws, userId);
  }

  /**
   * Remove the WebSocket→userId association for a disconnecting connection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime (Bun vs Node)
  unregisterUserConnection(ws: any, documentId: string): void {
    const doc = this.docs.get(documentId);
    if (doc) doc.wsUserIds.delete(ws);
  }

  /**
   * Attach element-change diffing to an `elements/` shared doc so that
   * creates, renames, and deletes emit `activity_events` rows. Idempotent —
   * calling it again for the same `documentId` is a no-op if an observer is
   * already registered (the snapshot will already exist).
   *
   * Must be called after the doc is loaded (i.e. after the first
   * `handleConnection` call for this documentId).
   */
  watchElementsDoc(documentId: string, projectId: string, db: DatabaseInstance): void {
    const sharedDoc = this.docs.get(documentId);
    if (!sharedDoc) return;
    // Already watching — don't attach a second listener.
    if (sharedDoc.elementSnapshot !== undefined) return;

    // Seed the initial snapshot from the current state.
    sharedDoc.elementSnapshot = this.buildElementSnapshot(sharedDoc.doc);

    sharedDoc.doc.on('update', (_update: Uint8Array, origin: unknown) => {
      const snapshot = sharedDoc.elementSnapshot!;
      const userId = sharedDoc.wsUserIds.get(origin as WebSocket) ?? null;
      if (!userId) return; // Ignore server-originated updates (persistence replay etc.)

      const newSnapshot = this.buildElementSnapshot(sharedDoc.doc);
      void this.emitElementDiffEvents(snapshot, newSnapshot, projectId, userId, db);
      sharedDoc.elementSnapshot = newSnapshot;
    });
  }

  /** Build a snapshot Map<elementId, {name, type}> from the current Y.Array state. */
  private buildElementSnapshot(doc: Y.Doc): Map<string, ElementSnapshot> {
    const snapshot = new Map<string, ElementSnapshot>();
    try {
      const arr = doc.getArray('elements');
      arr.forEach((value) => {
        if (value && typeof value === 'object') {
          const elem = value as Record<string, unknown>;
          const id = this.coerceFieldString(elem.id);
          if (id) {
            snapshot.set(id, {
              name: this.coerceFieldString(elem.name),
              type: this.coerceFieldString(elem.type) || 'ITEM',
            });
          }
        }
      });
    } catch (err) {
      yjsLog.debug(`Failed to build element snapshot: ${String(err)}`);
    }
    return snapshot;
  }

  /**
   * Diff two element snapshots and fire activity events for any changes.
   * Best-effort — failures are logged and swallowed.
   */
  private async emitElementDiffEvents(
    prev: Map<string, ElementSnapshot>,
    next: Map<string, ElementSnapshot>,
    projectId: string,
    userId: string,
    db: DatabaseInstance
  ): Promise<void> {
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
      yjsLog.error('Failed to emit element diff activity events', err, { projectId, userId });
    }
  }
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
          this.persistFailures.delete(doc.name);
          this.pendingSinceCompact.delete(doc.name);
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
    this.persistFailures.clear();
    this.pendingSinceCompact.clear();
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
      this.persistFailures.delete(docId);
      this.pendingSinceCompact.delete(docId);
    }

    yjsLog.info(`Project rename complete: ${oldProjectKey} -> ${newProjectKey}`);
  }
}

// Create singleton instance
export const yjsService = new YjsService();
