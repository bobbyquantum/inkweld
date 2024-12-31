import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebSocket } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

import { IMessageHandler, MessageType } from './websocket-handler';
import { WSSharedDoc } from './ws-shared-doc';

// Default message handler implementation

export class DefaultMessageHandler implements IMessageHandler {
  handleMessage(
    messageType: MessageType,
    decoder: decoding.Decoder,
    encoder: encoding.Encoder,
    doc: WSSharedDoc,
    conn: WebSocket
  ): void {
    switch (messageType) {
      case MessageType.Sync:
        encoding.writeVarUint(encoder, MessageType.Sync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        break;
      case MessageType.Awareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
    }
  }
}
