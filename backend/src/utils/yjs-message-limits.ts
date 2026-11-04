/**
 * Limits on the content of the sync and awareness messages a client sends.
 * Both runtimes check a message with {@link isYjsMessageWithinLimits} before
 * applying it (`YjsService.handleMessage` on Bun, `applyDocumentMessage` in the
 * Durable Object) and drop it when the check fails.
 *
 * A document's content and the awareness states are encoded again whenever
 * they are sent to another client, stored or compacted, and those encoders
 * (`JSON.stringify`, lib0's `writeAny`) work through a value one level of
 * nesting at a time. JSON values may therefore nest at most
 * {@link MAX_YJS_JSON_DEPTH} levels: far deeper than anything Inkweld writes
 * (a few levels), and well within what every runtime that encodes them,
 * browsers included, supports.
 */
import * as decoding from 'lib0/decoding';
import { messageYjsSyncStep2, messageYjsUpdate } from 'y-protocols/sync';
import * as Y from 'yjs';
import { Y_MESSAGE_AWARENESS, Y_MESSAGE_SYNC } from './yjs-document-utils';

/** How many levels of arrays and objects a JSON value in a message may nest. */
export const MAX_YJS_JSON_DEPTH = 256;

/**
 * Whether a client's Yjs message may be applied. A sync step 2, a sync update
 * or an awareness update must decode completely and hold no JSON value nested
 * deeper than {@link MAX_YJS_JSON_DEPTH}; any other message (sync step 1, a
 * type the handlers ignore) passes. A message whose type cannot be read fails.
 * Never throws.
 */
export function isYjsMessageWithinLimits(message: Uint8Array): boolean {
  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    if (messageType === Y_MESSAGE_AWARENESS) {
      return awarenessUpdateWithinLimits(decoding.readVarUint8Array(decoder));
    }
    if (messageType !== Y_MESSAGE_SYNC) return true;
    const syncType = decoding.readVarUint(decoder);
    if (syncType !== messageYjsSyncStep2 && syncType !== messageYjsUpdate) return true;
    return documentUpdateWithinLimits(decoding.readVarUint8Array(decoder));
  } catch {
    return false;
  }
}

/**
 * An awareness update (`y-protocols/awareness`) whose states all parse and
 * stay within the nesting limit. Every state is read up front, so a state
 * that would fail refuses the whole update rather than leaving the states
 * before it applied. Throws when the update does not decode.
 */
function awarenessUpdateWithinLimits(update: Uint8Array): boolean {
  const decoder = decoding.createDecoder(update);
  const count = decoding.readVarUint(decoder);
  for (let index = 0; index < count; index++) {
    decoding.readVarUint(decoder); // client id
    decoding.readVarUint(decoder); // clock
    const state: unknown = JSON.parse(decoding.readVarString(decoder));
    if (valueNestingExceeds(state, MAX_YJS_JSON_DEPTH)) return false;
  }
  return true;
}

/**
 * A Yjs document update (V1 encoding, as the sync protocol sends it) whose
 * JSON-valued content all stays within the nesting limit. Throws when the
 * update does not decode.
 */
function documentUpdateWithinLimits(update: Uint8Array): boolean {
  const { structs } = Y.decodeUpdate(update);
  return structs.every(
    (struct) =>
      !(struct instanceof Y.Item) ||
      !contentValues(struct.content).some((value) => valueNestingExceeds(value, MAX_YJS_JSON_DEPTH))
  );
}

/** The JSON values an item's content holds; none for strings, binary and types. */
function contentValues(content: Y.Item['content']): unknown[] {
  if (content instanceof Y.ContentAny || content instanceof Y.ContentJSON) return content.arr;
  if (content instanceof Y.ContentEmbed) return [content.embed];
  if (content instanceof Y.ContentFormat) return [content.value];
  if (content instanceof Y.ContentDoc) return [content.opts];
  return [];
}

/**
 * Whether `root` nests arrays and objects more than `maxDepth` levels deep.
 * Walks the value with its own stack, so any depth can be measured.
 */
function valueNestingExceeds(root: unknown, maxDepth: number): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const { value, depth } = next;
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array) continue;
    // `depth` arrays and objects enclose `value`, which is level `depth + 1`.
    if (depth >= maxDepth) return true;
    const children: unknown[] = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) pending.push({ value: child, depth: depth + 1 });
  }
  return false;
}
