/**
 * Shared presence protocol types.
 *
 * These types describe the *application-level* state the presence channel
 * exchanges. The on-the-wire binary representation lives in
 * `../protocol/codec.ts` and consumes/produces these shapes.
 *
 * Anything imported here must be safe to use in both Angular frontends and
 * Bun/Workers backends — no DOM, no Node, no Yjs, no ProseMirror.
 */

/**
 * Presence "liveness" classification.
 *
 * - `active`: user has interacted (mouse/keyboard/editor txn) within the
 *   activity window.
 * - `editing`: user is actively typing in a ProseMirror document. This is a
 *   superset of `active` for UI badge purposes — the badge ring overrides the
 *   ellipsis dot when the user is editing.
 * - `idle`: no interaction within the inactivity window (default 5 min).
 *
 * Servers MUST treat unknown status strings as `active` to allow forward
 * compatibility (newer clients introducing finer-grained states).
 */
export type PresenceStatus = 'active' | 'editing' | 'idle';

/**
 * Stable identity broadcast with every presence entry.
 *
 * `username` is the canonical de-duplication key across multiple devices /
 * tabs of the same user. `id` is the user's database id (kept for forward
 * compatibility — frontends may have it as a string or number depending on
 * surface; we serialize as string to be consistent).
 */
export interface PresenceUserIdentity {
  /** Database id of the user as a string. */
  id: string;
  /** Display username — the across-device de-dup key. */
  username: string;
  /** Stable hex color (e.g. `#a1b2c3`) used for cursors / avatars. */
  color: string;
}

/**
 * Discriminated union describing where in the project the user is currently
 * focused. This drives "X people on this tab" indicators and is the canonical
 * way for consumers to filter the global presence map.
 *
 * Adding a new tab type? Add a member here AND a new
 * `kind` literal — the codec uses the literal string as the wire key.
 */
export type PresenceLocation =
  | { kind: 'elements' }
  | { kind: 'document'; documentId: string }
  | { kind: 'timeline'; elementId: string }
  | { kind: 'canvas'; elementId: string }
  | { kind: 'worldbuilding'; schemaId?: string }
  | { kind: 'media' }
  | { kind: 'settings' }
  | { kind: 'other'; label: string };

/**
 * ProseMirror cursor position expressed in **stable** coordinates.
 *
 * Anchor/head are encoded as Uint8Array because they are produced by
 * `Y.encodeRelativePosition` on the sender. The receiver decodes them back
 * into `Y.RelativePosition` and then resolves to absolute positions inside
 * the receiver's own Y.Doc, surviving concurrent edits.
 *
 * The codec stores them as `varUint8Array` so they round-trip losslessly.
 */
export interface PresenceProseMirrorSelection {
  kind: 'prosemirror';
  /** ID of the document the cursor lives in (`username:slug:elementId`). */
  documentId: string;
  /** Encoded `Y.RelativePosition` for the selection anchor. */
  anchor: Uint8Array;
  /** Encoded `Y.RelativePosition` for the selection head. */
  head: Uint8Array;
}

/**
 * Timeline range or single point selection. `start`/`end` are project-time
 * coordinates as plain numbers — interpretation is delegated to consumers
 * (different time systems exist). `start === end` indicates a point cursor.
 */
export interface PresenceTimelineSelection {
  kind: 'timeline';
  elementId: string;
  start: number;
  end: number;
}

/**
 * Canvas selection — opaque IDs of the canvas elements / shapes the user has
 * selected. We don't ship coordinates because rendering ghost rectangles for
 * other users would be heavy; the avatar-on-tab indicator is enough.
 */
export interface PresenceCanvasSelection {
  kind: 'canvas';
  elementId: string;
  selectedIds: string[];
}

/**
 * Worldbuilding selection — current schema being viewed and the selected row
 * (if any).
 */
export interface PresenceWorldbuildingSelection {
  kind: 'worldbuilding';
  schemaId?: string;
  selectedElementId?: string;
}

/**
 * Discriminated union of all selection payload types. Consumers pattern-match
 * on `kind`. Adding a new variant requires updating
 * `protocol/codec.ts:writeSelection/readSelection`.
 */
export type PresenceSelection =
  | PresenceProseMirrorSelection
  | PresenceTimelineSelection
  | PresenceCanvasSelection
  | PresenceWorldbuildingSelection;

/**
 * Full per-session presence record. This is the shape the server stores per
 * connection and the shape clients receive for every other connection.
 *
 * Notes:
 * - `sessionId` uniquely identifies one WebSocket connection. Multi-tab same
 *   user => multiple sessions, all sharing `user.username`.
 * - `lastActivityAt` is wall-clock ms since epoch (sender's clock). Servers
 *   MUST NOT trust it for liveness logic — it's only for display.
 * - `selection` is optional; absence means the user has no relevant selection
 *   for their current `location` (e.g. they're on the Elements tab).
 */
export interface PresenceSession {
  sessionId: string;
  user: PresenceUserIdentity;
  status: PresenceStatus;
  location: PresenceLocation;
  selection?: PresenceSelection;
  lastActivityAt: number;
}

/**
 * Field-level update payload. Anything `undefined` here means "leave the
 * server-side state alone". `selection: null` is the only way to *clear* a
 * previously-set selection (the codec encodes nullness explicitly so
 * undefined and null don't collide on the wire).
 */
export interface PresenceUpdateFields {
  status?: PresenceStatus;
  location?: PresenceLocation;
  selection?: PresenceSelection | null;
  lastActivityAt?: number;
}
