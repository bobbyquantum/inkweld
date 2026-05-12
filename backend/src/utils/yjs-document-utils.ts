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

/** Sync protocol message type — Yjs sync (subtypes inside the frame). */
export const Y_MESSAGE_SYNC = 0;
/** Sync protocol message type — Yjs awareness updates. */
export const Y_MESSAGE_AWARENESS = 1;

/**
 * Parse the project owner + slug out of a Yjs document id. Returns null
 * for malformed ids. Strips the optional `worldbuilding:` prefix so the
 * worldbuilding namespace resolves to the same project access record.
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
 * Detect Yjs frames that mutate document state. Read-only viewers must
 * receive sync-step-1 / sync-step-2 from the server and may broadcast
 * awareness, but must not send sync-step-2 (their own snapshot),
 * sync-update (binary diff) frames, or top-level update frames
 * (messageType === 2) back to the server.
 *
 * Returns true when the message should be dropped for a viewer.
 */
export function isYjsFrameBlockedForViewer(message: ArrayBuffer | Uint8Array): boolean {
  const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
  if (bytes.length === 0) return false;
  const messageType = bytes[0];

  // Awareness messages are always allowed (presence / cursors).
  if (messageType === Y_MESSAGE_AWARENESS) return false;

  // Top-level update frame — viewers cannot send these.
  if (messageType === 2) return true;

  // Sync messages — inspect the sync sub-type (second byte).
  if (messageType === Y_MESSAGE_SYNC && bytes.length > 1) {
    const syncMessageType = bytes[1];
    // 1 = sync-step-2 (client snapshot), 2 = sync-update (binary diff).
    if (syncMessageType === 1 || syncMessageType === 2) {
      return true;
    }
  }

  return false;
}
