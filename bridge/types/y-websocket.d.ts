declare module 'y-websocket/bin/utils' {
  import { IncomingMessage } from 'http';
  import { WebSocket } from 'ws';
  import { Awareness } from 'y-protocols/awareness';
  import * as Y from 'yjs';

  export interface WSSharedDoc extends Y.Doc {
    name: string;
    conns: Map<WebSocket, Set<number>>;
    awareness: Awareness;
  }

  export interface PersistenceAdapter {
    bindState: (docName: string, ydoc: Y.Doc) => void;
    writeState: (docName: string, ydoc: Y.Doc) => Promise<void>;
  }

  export function setPersistence(persistence: PersistenceAdapter): void;
  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    options?: {
      docName?: string;
      gc?: boolean;
    }
  ): void;
}
