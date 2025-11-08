import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocket } from 'ws';
import { fileStorageService } from './file-storage.service';
import * as path from 'path';

const messageSync = 0;
const messageAwareness = 1;

interface WSSharedDoc {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

export class YjsService {
  private docs = new Map<string, WSSharedDoc>();
  private persistences = new Map<string, LeveldbPersistence>();

  /**
   * Get or create a document
   */
  async getDocument(documentId: string): Promise<WSSharedDoc> {
    let doc = this.docs.get(documentId);
    if (!doc) {
      const ydoc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(ydoc);

      doc = {
        name: documentId,
        doc: ydoc,
        awareness,
        conns: new Map(),
      };

      // Set up persistence
      await this.setupPersistence(documentId, ydoc);

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
      console.error('Invalid documentId format:', documentId);
      return;
    }

    const [username, projectSlug] = parts;
    const dbPath = path.join(fileStorageService.getProjectPath(username, projectSlug), '.yjs');

    let persistence = this.persistences.get(documentId);
    if (!persistence) {
      persistence = new LeveldbPersistence(dbPath);
      this.persistences.set(documentId, persistence);
    }

    // Load existing state from persistence
    try {
      const persistedState = await persistence.getYDoc(documentId);
      if (persistedState && persistedState.store && persistedState.store.clients.size > 0) {
        // Apply persisted state to the document
        const stateVector = Y.encodeStateVector(ydoc);
        const diff = Y.encodeStateAsUpdate(persistedState, stateVector);
        Y.applyUpdate(ydoc, diff);
      }

      // Listen for updates and persist them
      ydoc.on('update', async (update: Uint8Array) => {
        try {
          if (persistence) {
            await persistence.storeUpdate(documentId, update);
          }
        } catch (error) {
          console.error('Error persisting update:', error);
        }
      });
    } catch (error) {
      console.error('Error loading persisted state:', error);
    }
  }

  /**
   * Handle WebSocket connection for a document - returns the doc for message handling
   */
  async handleConnection(ws: any, documentId: string, userId?: string): Promise<WSSharedDoc> {
    const doc = await this.getDocument(documentId);

    // Add connection
    doc.conns.set(ws, new Set());

    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc.doc);
    ws.send(encoding.toUint8Array(encoder));

    // Send awareness states
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

    // Set user awareness
    if (userId) {
      doc.awareness.setLocalStateField('user', { id: userId });
    }

    return doc;
  }

  /**
   * Handle incoming message - call this from WebSocket onMessage handler
   */
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
          awarenessProtocol.applyAwarenessUpdate(
            doc.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          // Broadcast awareness to others
          this.broadcastMessage(doc, message, ws);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Handle disconnection - call this from WebSocket onClose handler
   */
  handleDisconnect(ws: any, doc: WSSharedDoc) {
    doc.conns.delete(ws);

    // Clean up document if no more connections
    if (doc.conns.size === 0) {
      // Keep document in memory for 1 minute after last disconnect
      setTimeout(() => {
        if (doc.conns.size === 0) {
          this.docs.delete(doc.name);
          console.log(`Document ${doc.name} cleaned up after inactivity`);
        }
      }, 60000);
    }
  }

  /**
   * Broadcast message to all connections except sender
   */
  private broadcastMessage(doc: WSSharedDoc, message: Uint8Array, exclude?: any) {
    doc.conns.forEach((_, conn) => {
      if (conn !== exclude) {
        try {
          conn.send(message);
        } catch (error) {
          console.error('Error broadcasting message:', error);
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
        ws.close();
      });
      doc.doc.destroy();
    });

    // Close all persistence connections
    for (const [, persistence] of this.persistences) {
      await persistence.clearDocument();
    }

    this.docs.clear();
    this.persistences.clear();
  }
}

// Create singleton instance
export const yjsService = new YjsService();
