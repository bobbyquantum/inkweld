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
  getDocument(documentId: string): WSSharedDoc {
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
      this.setupPersistence(documentId, ydoc);

      this.docs.set(documentId, doc);
    }
    return doc;
  }

  /**
   * Setup LevelDB persistence for a document
   */
  private setupPersistence(documentId: string, ydoc: Y.Doc) {
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

    // Bind document to persistence
    persistence.bindState(documentId, ydoc);
  }

  /**
   * Handle WebSocket connection for a document
   */
  handleConnection(ws: WebSocket, documentId: string, userId?: string) {
    const doc = this.getDocument(documentId);

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

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      this.handleMessage(ws, doc, message);
    });

    // Handle connection close
    ws.on('close', () => {
      this.handleDisconnect(ws, doc);
    });

    // Set user awareness
    if (userId) {
      doc.awareness.setLocalStateField('user', { id: userId });
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, doc: WSSharedDoc, message: Buffer) {
    try {
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync: {
          encoding.writeVarUint(decoder, messageSync);
          const syncMessageType = syncProtocol.readSyncMessage(decoder, decoder, doc.doc, ws);

          if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
            // Broadcast to all other connections
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeSyncStep2(encoder, doc.doc);
            this.broadcastMessage(doc, encoding.toUint8Array(encoder), ws);
          }
          break;
        }

        case messageAwareness:
          awarenessProtocol.applyAwarenessUpdate(
            doc.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Broadcast message to all connections except sender
   */
  private broadcastMessage(doc: WSSharedDoc, message: Uint8Array, exclude?: WebSocket) {
    doc.conns.forEach((_, conn) => {
      if (conn !== exclude && conn.readyState === WebSocket.OPEN) {
        conn.send(message);
      }
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(ws: WebSocket, doc: WSSharedDoc) {
    doc.conns.delete(ws);

    // Clean up document if no more connections
    if (doc.conns.size === 0) {
      // Keep document in memory for 1 minute after last disconnect
      setTimeout(() => {
        if (doc.conns.size === 0) {
          this.docs.delete(doc.name);
          doc.doc.destroy();
        }
      }, 60000);
    }
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
