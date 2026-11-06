/**
 * Yjs sync and awareness messages for the tests of the message checks in
 * `src/utils/yjs-message-limits.ts`, written the way y-websocket sends them.
 */
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

/** Outer message types (`y-websocket`). */
export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

/** `depth` arrays nested around a number: `[[1]]` has depth 2. */
export function nestedArrays(depth: number): unknown {
  let value: unknown = 1;
  for (let level = 0; level < depth; level++) value = [value];
  return value;
}

/** The update that applies `edit` to a fresh document. */
export function updateOf(edit: (doc: Y.Doc) => void): Uint8Array {
  const doc = new Y.Doc();
  edit(doc);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}

/** A sync message: step 1 for a fresh document. */
export function syncStep1Message(): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  return encoding.toUint8Array(encoder);
}

/** A sync message carrying `update`, as a step 2 reply or as an update. */
export function syncMessage(update: Uint8Array, kind: 'step2' | 'update' = 'update'): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  encoding.writeVarUint(
    encoder,
    kind === 'step2' ? syncProtocol.messageYjsSyncStep2 : syncProtocol.messageYjsUpdate
  );
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/**
 * An update holding one JSON item (`ContentJSON`, content ref 2) in the root
 * array `rootName`. Current Yjs writes `ContentAny` instead, but every version
 * still reads JSON items, so a client can send them.
 */
export function legacyJsonUpdate(rootName: string, jsonText: string, client = 7): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 1); // clients
  encoding.writeVarUint(encoder, 1); // structs from this client
  encoding.writeVarUint(encoder, client);
  encoding.writeVarUint(encoder, 0); // clock
  encoding.writeUint8(encoder, 2); // ContentJSON, no origins, no parentSub
  encoding.writeVarUint(encoder, 1); // the parent is a root type, named next
  encoding.writeVarString(encoder, rootName);
  encoding.writeVarUint(encoder, 1); // one JSON value
  encoding.writeVarString(encoder, jsonText);
  encoding.writeVarUint(encoder, 0); // empty delete set
  return encoding.toUint8Array(encoder);
}

/** One client's entry in an awareness update, its state given as JSON text. */
export interface AwarenessEntry {
  clientId: number;
  clock: number;
  stateJson: string;
}

/** An awareness message carrying an encoded `y-protocols/awareness` update. */
export function awarenessUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

/** An awareness message whose update holds these entries. */
export function awarenessMessage(entries: AwarenessEntry[]): Uint8Array {
  const update = encoding.createEncoder();
  encoding.writeVarUint(update, entries.length);
  for (const { clientId, clock, stateJson } of entries) {
    encoding.writeVarUint(update, clientId);
    encoding.writeVarUint(update, clock);
    encoding.writeVarString(update, stateJson);
  }
  return awarenessUpdateMessage(encoding.toUint8Array(update));
}
