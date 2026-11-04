/**
 * Pure helpers for working with Yjs document IDs and Yjs sync frames.
 *
 * These were originally duplicated between the Bun WebSocket route
 * (routes/yjs.routes.ts) and the Cloudflare Durable Object
 * (durable-objects/yjs-project.do.ts). Extracting them keeps the two
 * runtimes in lockstep and makes the parsing logic unit-testable
 * without standing up a Workers / DO runtime.
 *
 * Document ID formats handled here:
 *   - `username:slug:elements`        — the project-level elements tree
 *   - `username:slug:elementId`       — a prose document (trackable)
 *   - `username:slug:elementId/`      — same, with the legacy trailing slash
 *   - `worldbuilding:username:slug:…` — worldbuilding docs (NOT trackable)
 */

import { createDecoder, readVarUint } from 'lib0/decoding';

/** Sync protocol message type — Yjs sync (subtypes inside the frame). */
export const Y_MESSAGE_SYNC = 0;
/** Sync protocol message type — Yjs awareness updates. */
export const Y_MESSAGE_AWARENESS = 1;

/**
 * Read the outer multiplex message type from a Yjs wire frame.
 *
 * The wire format prefixes each frame with a lib0 varuint message type. Every
 * type this app emits (0 = sync, 1 = awareness, 100 = presence) fits in a
 * single byte (values < 128 have their high bit clear, terminating the
 * varuint), so `bytes[0]` is the full type for all realistic frames. When the
 * first byte has the continuation bit set (≥ 128) we fall back to a proper
 * lib0 varuint decode.
 *
 * Returns -1 for an empty frame.
 */
export function frameMessageType(message: ArrayBuffer | Uint8Array): number {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  if (bytes.length === 0) return -1;
  const first = bytes[0];
  if (first < 0x80) return first;
  // Multi-byte varuint — decode manually (lib0's readVarUint inlined).
  let num = 0;
  let mult = 1;
  for (const b of bytes) {
    num += (b & 0x7f) * mult;
    mult *= 128;
    if (b < 0x80) return num;
  }
  return num;
}

/**
 * True when the frame is a Yjs sync message (the only type we persist as a
 * document update). Awareness frames (ephemeral presence/cursors) and
 * presence frames (app-level multiplex) must NOT be persisted — persisting
 * them grows the per-doc update log without bound and makes every document
 * load replay thousands of transient frames.
 */
export function isSyncFrame(message: ArrayBuffer | Uint8Array): boolean {
  return frameMessageType(message) === Y_MESSAGE_SYNC;
}

/** Sync sub-type of a state vector request (`y-protocols/sync` messageYjsSyncStep1). */
export const Y_SYNC_STEP_1 = 0;

/** Sync sub-type of a document update (`y-protocols/sync` messageYjsUpdate). */
export const Y_SYNC_UPDATE = 2;

/**
 * True when the frame is a sync *update* — a change to the document, as the
 * Durable Object's shared doc emits for every applied edit.
 *
 * The shared doc's notify stream also carries the sync-step-2 reply the
 * server sends to each connecting client. That reply is the server's own,
 * already-persisted state, so storing it would write a full copy of the
 * document on every connection and move the document's revision token (see
 * `readRevision`) even though nothing changed.
 */
export function isSyncUpdateFrame(message: ArrayBuffer | Uint8Array): boolean {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  return bytes.length > 1 && bytes[0] === Y_MESSAGE_SYNC && bytes[1] === Y_SYNC_UPDATE;
}

/**
 * Parse the project owner + slug out of a Yjs document id. Returns null
 * for malformed ids. Strips the optional `worldbuilding:` prefix so the
 * worldbuilding namespace resolves to the same project access record.
 *
 * Not for ids that come from a client: those go through `parseDocumentId`
 * (`utils/yjs-document-id.ts`), which the sync routes and the Durable Object
 * share, so access is checked on the project the documents live in.
 */
export function parseDocumentOwner(
  documentId: string
): { projectOwner: string; slug: string } | null {
  let docIdForParsing = documentId;
  if (docIdForParsing.startsWith('worldbuilding:')) {
    docIdForParsing = docIdForParsing.substring('worldbuilding:'.length);
  }
  const parts = docIdForParsing.split(':');
  if (parts.length < 2) return null;
  if (!parts[0] || !parts[1]) return null;
  return { projectOwner: parts[0], slug: parts[1] };
}

/**
 * Whether a project's `username` and `slug` can be joined into a document id
 * (`username:slug:…`). Ids are split on `:` to find the project, so a part
 * that contains one would be read as a different project. Accounts created
 * before usernames had a character rule may have one.
 */
export function canNameProjectInDocumentId(username: string, slug: string): boolean {
  return Boolean(username) && Boolean(slug) && !username.includes(':') && !slug.includes(':');
}

/**
 * Extract the trackable elementId from a documentId. Returns null when
 * the document is NOT a prose document — i.e. the project-level
 * `elements` tree, a `worldbuilding:` doc, or a malformed id. Trims the
 * legacy trailing slash before splitting.
 *
 * Trackable ids are the only ones for which we open writing sessions
 * and emit `document_edit` activity events.
 */
export function parseTrackableElementId(documentId: string): string | null {
  if (documentId.startsWith('worldbuilding:')) return null;
  const trimmed = documentId.endsWith('/') ? documentId.slice(0, -1) : documentId;
  const parts = trimmed.split(':');
  if (parts.length < 3) return null;
  const elementId = parts.slice(2).join(':');
  if (!elementId || elementId === 'elements') return null;
  return elementId;
}

/**
 * Returns true when the document id refers to the project-level elements tree
 * (`username:slug:elements` or `username:slug:elements/`). These docs carry
 * the full element array and are the source of `element_created`,
 * `element_renamed`, and `element_deleted` activity events.
 */
export function isElementsDoc(documentId: string): boolean {
  const trimmed = documentId.endsWith('/') ? documentId.slice(0, -1) : documentId;
  const parts = trimmed.split(':');
  return parts.length === 3 && parts[2] === 'elements';
}

/**
 * Detect Yjs frames a read-only viewer may not send. A viewer may ask for
 * the document (sync step 1) and broadcast awareness (presence / cursors).
 * Everything else is dropped: sync step 2 (its own snapshot), sync updates,
 * any other message type, and frames that don't decode.
 *
 * The types are read with lib0's `readVarUint`, exactly as the sync handlers
 * read them (`yjsService.handleMessage`, y-durableobjects'
 * `WSSharedDoc.update`). A varuint can be padded (`0x82 0x00` is also 2), so
 * comparing raw bytes let through updates that the handlers then applied.
 *
 * Returns true when the message should be dropped for a viewer.
 */
export function isYjsFrameBlockedForViewer(message: ArrayBuffer | Uint8Array): boolean {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  try {
    const decoder = createDecoder(bytes);
    const messageType = readVarUint(decoder);
    if (messageType === Y_MESSAGE_AWARENESS) return false;
    return messageType !== Y_MESSAGE_SYNC || readVarUint(decoder) !== Y_SYNC_STEP_1;
  } catch {
    // Truncated: the handlers can't read it either.
    return true;
  }
}
