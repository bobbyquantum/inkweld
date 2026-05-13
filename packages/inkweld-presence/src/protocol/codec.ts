/**
 * Binary codec for the presence protocol.
 *
 * All functions in this module operate on lib0 `Encoder`/`Decoder` instances
 * passed in by the caller. Callers are responsible for the OUTER multiplex
 * tag (`Y_MESSAGE_PRESENCE = 100`) — the encoders here begin with the INNER
 * presence message-type tag.
 *
 * ## Conventions
 *
 * - Strings: `writeVarString` (length-prefixed UTF-8).
 * - Numbers: `writeFloat64` for timestamps and floating-point coordinates;
 *   `writeVarUint` for tag bytes and small enums.
 * - Optional fields: a single `writeVarUint` of 0 (absent) or 1 (present).
 * - Discriminated unions (location, selection): `writeVarUint(tag)` followed
 *   by tag-specific body. New variants MUST keep existing tag numbers stable.
 * - Byte arrays: `writeVarUint8Array` (length-prefixed bytes).
 *
 * ## Forward compatibility
 *
 * Decoders MUST tolerate unknown variant tags by either skipping the message
 * or substituting a safe default. The current implementation throws on
 * unknown tags because we own both ends and want loud failures during
 * development; revisit if/when we ship third-party clients.
 */

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import {
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_LEAVE,
  PRESENCE_MSG_SNAPSHOT,
  PRESENCE_MSG_UPDATE,
  type PresenceMessageType,
} from './message-types';
import {
  type PresenceLocation,
  type PresenceSelection,
  type PresenceSession,
  type PresenceStatus,
  type PresenceUpdateFields,
  type PresenceUserIdentity,
} from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Status (3 known values, 1 byte)
// ────────────────────────────────────────────────────────────────────────────

const STATUS_TAG_ACTIVE = 0;
const STATUS_TAG_EDITING = 1;
const STATUS_TAG_IDLE = 2;

function writeStatus(encoder: encoding.Encoder, status: PresenceStatus): void {
  switch (status) {
    case 'active':
      encoding.writeVarUint(encoder, STATUS_TAG_ACTIVE);
      return;
    case 'editing':
      encoding.writeVarUint(encoder, STATUS_TAG_EDITING);
      return;
    case 'idle':
      encoding.writeVarUint(encoder, STATUS_TAG_IDLE);
      return;
  }
}

function readStatus(decoder: decoding.Decoder): PresenceStatus {
  const tag = decoding.readVarUint(decoder);
  switch (tag) {
    case STATUS_TAG_ACTIVE:
      return 'active';
    case STATUS_TAG_EDITING:
      return 'editing';
    case STATUS_TAG_IDLE:
      return 'idle';
    default:
      // Forward-compat: treat unknowns as `active` so a newer peer's
      // refined state doesn't make the user vanish from older UIs.
      return 'active';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// User identity
// ────────────────────────────────────────────────────────────────────────────

function writeUser(encoder: encoding.Encoder, user: PresenceUserIdentity): void {
  encoding.writeVarString(encoder, user.id);
  encoding.writeVarString(encoder, user.username);
  encoding.writeVarString(encoder, user.color);
}

function readUser(decoder: decoding.Decoder): PresenceUserIdentity {
  return {
    id: decoding.readVarString(decoder),
    username: decoding.readVarString(decoder),
    color: decoding.readVarString(decoder),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Location (discriminated union)
// ────────────────────────────────────────────────────────────────────────────

const LOC_TAG_ELEMENTS = 0;
const LOC_TAG_DOCUMENT = 1;
const LOC_TAG_TIMELINE = 2;
const LOC_TAG_CANVAS = 3;
const LOC_TAG_WORLDBUILDING = 4;
const LOC_TAG_MEDIA = 5;
const LOC_TAG_SETTINGS = 6;
const LOC_TAG_OTHER = 7;

function writeLocation(encoder: encoding.Encoder, location: PresenceLocation): void {
  switch (location.kind) {
    case 'elements':
      encoding.writeVarUint(encoder, LOC_TAG_ELEMENTS);
      return;
    case 'document':
      encoding.writeVarUint(encoder, LOC_TAG_DOCUMENT);
      encoding.writeVarString(encoder, location.documentId);
      return;
    case 'timeline':
      encoding.writeVarUint(encoder, LOC_TAG_TIMELINE);
      encoding.writeVarString(encoder, location.elementId);
      return;
    case 'canvas':
      encoding.writeVarUint(encoder, LOC_TAG_CANVAS);
      encoding.writeVarString(encoder, location.elementId);
      return;
    case 'worldbuilding':
      encoding.writeVarUint(encoder, LOC_TAG_WORLDBUILDING);
      writeOptionalString(encoder, location.schemaId);
      return;
    case 'media':
      encoding.writeVarUint(encoder, LOC_TAG_MEDIA);
      return;
    case 'settings':
      encoding.writeVarUint(encoder, LOC_TAG_SETTINGS);
      return;
    case 'other':
      encoding.writeVarUint(encoder, LOC_TAG_OTHER);
      encoding.writeVarString(encoder, location.label);
      return;
  }
}

function readLocation(decoder: decoding.Decoder): PresenceLocation {
  const tag = decoding.readVarUint(decoder);
  switch (tag) {
    case LOC_TAG_ELEMENTS:
      return { kind: 'elements' };
    case LOC_TAG_DOCUMENT:
      return { kind: 'document', documentId: decoding.readVarString(decoder) };
    case LOC_TAG_TIMELINE:
      return { kind: 'timeline', elementId: decoding.readVarString(decoder) };
    case LOC_TAG_CANVAS:
      return { kind: 'canvas', elementId: decoding.readVarString(decoder) };
    case LOC_TAG_WORLDBUILDING: {
      const schemaId = readOptionalString(decoder);
      return schemaId === undefined
        ? { kind: 'worldbuilding' }
        : { kind: 'worldbuilding', schemaId };
    }
    case LOC_TAG_MEDIA:
      return { kind: 'media' };
    case LOC_TAG_SETTINGS:
      return { kind: 'settings' };
    case LOC_TAG_OTHER:
      return { kind: 'other', label: decoding.readVarString(decoder) };
    default:
      // Forward-compat: degrade to a labelled `other`.
      return { kind: 'other', label: `unknown:${tag}` };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Selection (discriminated union)
// ────────────────────────────────────────────────────────────────────────────

const SEL_TAG_PROSEMIRROR = 0;
const SEL_TAG_TIMELINE = 1;
const SEL_TAG_CANVAS = 2;
const SEL_TAG_WORLDBUILDING = 3;

function writeSelection(encoder: encoding.Encoder, selection: PresenceSelection): void {
  switch (selection.kind) {
    case 'prosemirror':
      encoding.writeVarUint(encoder, SEL_TAG_PROSEMIRROR);
      encoding.writeVarString(encoder, selection.documentId);
      encoding.writeVarUint8Array(encoder, selection.anchor);
      encoding.writeVarUint8Array(encoder, selection.head);
      return;
    case 'timeline':
      encoding.writeVarUint(encoder, SEL_TAG_TIMELINE);
      encoding.writeVarString(encoder, selection.elementId);
      encoding.writeFloat64(encoder, selection.start);
      encoding.writeFloat64(encoder, selection.end);
      return;
    case 'canvas':
      encoding.writeVarUint(encoder, SEL_TAG_CANVAS);
      encoding.writeVarString(encoder, selection.elementId);
      encoding.writeVarUint(encoder, selection.selectedIds.length);
      for (const id of selection.selectedIds) {
        encoding.writeVarString(encoder, id);
      }
      return;
    case 'worldbuilding':
      encoding.writeVarUint(encoder, SEL_TAG_WORLDBUILDING);
      writeOptionalString(encoder, selection.schemaId);
      writeOptionalString(encoder, selection.selectedElementId);
      return;
  }
}

function readSelection(decoder: decoding.Decoder): PresenceSelection {
  const tag = decoding.readVarUint(decoder);
  switch (tag) {
    case SEL_TAG_PROSEMIRROR: {
      const documentId = decoding.readVarString(decoder);
      const anchor = decoding.readVarUint8Array(decoder);
      const head = decoding.readVarUint8Array(decoder);
      return { kind: 'prosemirror', documentId, anchor, head };
    }
    case SEL_TAG_TIMELINE: {
      const elementId = decoding.readVarString(decoder);
      const start = decoding.readFloat64(decoder);
      const end = decoding.readFloat64(decoder);
      return { kind: 'timeline', elementId, start, end };
    }
    case SEL_TAG_CANVAS: {
      const elementId = decoding.readVarString(decoder);
      const count = decoding.readVarUint(decoder);
      const selectedIds: string[] = new Array<string>(count);
      for (let i = 0; i < count; i++) {
        selectedIds[i] = decoding.readVarString(decoder);
      }
      return { kind: 'canvas', elementId, selectedIds };
    }
    case SEL_TAG_WORLDBUILDING: {
      const schemaId = readOptionalString(decoder);
      const selectedElementId = readOptionalString(decoder);
      return {
        kind: 'worldbuilding',
        ...(schemaId !== undefined && { schemaId }),
        ...(selectedElementId !== undefined && { selectedElementId }),
      };
    }
    default:
      throw new Error(`presence codec: unknown selection tag ${tag}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Optional helpers
// ────────────────────────────────────────────────────────────────────────────

function writeOptionalString(encoder: encoding.Encoder, value: string | undefined): void {
  if (value === undefined) {
    encoding.writeVarUint(encoder, 0);
    return;
  }
  encoding.writeVarUint(encoder, 1);
  encoding.writeVarString(encoder, value);
}

function readOptionalString(decoder: decoding.Decoder): string | undefined {
  const present = decoding.readVarUint(decoder);
  if (present === 0) return undefined;
  if (present === 1) return decoding.readVarString(decoder);
  throw new Error(`presence codec: invalid optional-string flag ${present}`);
}

function writeOptionalSelection(
  encoder: encoding.Encoder,
  /** `undefined` → unset; `null` → explicit clear; value → set. */
  selection: PresenceSelection | null | undefined
): void {
  if (selection === undefined) {
    encoding.writeVarUint(encoder, 0); // unset
    return;
  }
  if (selection === null) {
    encoding.writeVarUint(encoder, 1); // explicit clear
    return;
  }
  encoding.writeVarUint(encoder, 2); // present
  writeSelection(encoder, selection);
}

function readOptionalSelection(
  decoder: decoding.Decoder
): PresenceSelection | null | undefined {
  const present = decoding.readVarUint(decoder);
  if (present === 0) return undefined;
  if (present === 1) return null;
  return readSelection(decoder);
}

// ────────────────────────────────────────────────────────────────────────────
// Full session (used by Hello and Snapshot)
// ────────────────────────────────────────────────────────────────────────────

function writeSession(encoder: encoding.Encoder, session: PresenceSession): void {
  encoding.writeVarString(encoder, session.sessionId);
  writeUser(encoder, session.user);
  writeStatus(encoder, session.status);
  writeLocation(encoder, session.location);
  // Selection is optional but cannot be "explicitly cleared" inside a full
  // session record (unlike Update). So we use the simple optional-string
  // pattern: 0 = absent, 1 = present.
  if (session.selection === undefined) {
    encoding.writeVarUint(encoder, 0);
  } else {
    encoding.writeVarUint(encoder, 1);
    writeSelection(encoder, session.selection);
  }
  encoding.writeFloat64(encoder, session.lastActivityAt);
}

function readSession(decoder: decoding.Decoder): PresenceSession {
  const sessionId = decoding.readVarString(decoder);
  const user = readUser(decoder);
  const status = readStatus(decoder);
  const location = readLocation(decoder);
  const selectionPresent = decoding.readVarUint(decoder);
  const selection = selectionPresent === 1 ? readSelection(decoder) : undefined;
  const lastActivityAt = decoding.readFloat64(decoder);
  return {
    sessionId,
    user,
    status,
    location,
    ...(selection !== undefined && { selection }),
    lastActivityAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level message encoders
// Each writes only the INNER message body (after the multiplex byte 100).
// The first thing written is always `PresenceMessageType`.
// ────────────────────────────────────────────────────────────────────────────

/** `Hello` — first message a client sends after authentication. */
export function writeHello(encoder: encoding.Encoder, session: PresenceSession): void {
  encoding.writeVarUint(encoder, PRESENCE_MSG_HELLO);
  writeSession(encoder, session);
}

/** `Update` — partial delta. Only fields the sender wants to mutate. */
export function writeUpdate(
  encoder: encoding.Encoder,
  sessionId: string,
  fields: PresenceUpdateFields
): void {
  encoding.writeVarUint(encoder, PRESENCE_MSG_UPDATE);
  encoding.writeVarString(encoder, sessionId);

  // Status (optional)
  if (fields.status === undefined) {
    encoding.writeVarUint(encoder, 0);
  } else {
    encoding.writeVarUint(encoder, 1);
    writeStatus(encoder, fields.status);
  }

  // Location (optional)
  if (fields.location === undefined) {
    encoding.writeVarUint(encoder, 0);
  } else {
    encoding.writeVarUint(encoder, 1);
    writeLocation(encoder, fields.location);
  }

  // Selection (tri-state)
  writeOptionalSelection(encoder, fields.selection);

  // lastActivityAt (optional)
  if (fields.lastActivityAt === undefined) {
    encoding.writeVarUint(encoder, 0);
  } else {
    encoding.writeVarUint(encoder, 1);
    encoding.writeFloat64(encoder, fields.lastActivityAt);
  }
}

/** `Leave` — sent by the server when a session disconnects. */
export function writeLeave(encoder: encoding.Encoder, sessionId: string): void {
  encoding.writeVarUint(encoder, PRESENCE_MSG_LEAVE);
  encoding.writeVarString(encoder, sessionId);
}

/** `Snapshot` — sent by the server to a freshly-connected client. */
export function writeSnapshot(
  encoder: encoding.Encoder,
  sessions: readonly PresenceSession[]
): void {
  encoding.writeVarUint(encoder, PRESENCE_MSG_SNAPSHOT);
  encoding.writeVarUint(encoder, sessions.length);
  for (const session of sessions) {
    writeSession(encoder, session);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level message decoder
// Caller has already consumed the outer multiplex byte (100).
// Returns a discriminated union the caller can `switch` on.
// ────────────────────────────────────────────────────────────────────────────

export type DecodedPresenceMessage =
  | { type: typeof PRESENCE_MSG_HELLO; session: PresenceSession }
  | { type: typeof PRESENCE_MSG_UPDATE; sessionId: string; fields: PresenceUpdateFields }
  | { type: typeof PRESENCE_MSG_LEAVE; sessionId: string }
  | { type: typeof PRESENCE_MSG_SNAPSHOT; sessions: PresenceSession[] };

export function readPresenceMessage(decoder: decoding.Decoder): DecodedPresenceMessage {
  const type = decoding.readVarUint(decoder) as PresenceMessageType;
  switch (type) {
    case PRESENCE_MSG_HELLO:
      return { type, session: readSession(decoder) };
    case PRESENCE_MSG_UPDATE: {
      const sessionId = decoding.readVarString(decoder);
      const fields: PresenceUpdateFields = {};

      if (decoding.readVarUint(decoder) === 1) fields.status = readStatus(decoder);
      if (decoding.readVarUint(decoder) === 1) fields.location = readLocation(decoder);

      const sel = readOptionalSelection(decoder);
      if (sel !== undefined) fields.selection = sel;

      if (decoding.readVarUint(decoder) === 1) {
        fields.lastActivityAt = decoding.readFloat64(decoder);
      }

      return { type, sessionId, fields };
    }
    case PRESENCE_MSG_LEAVE:
      return { type, sessionId: decoding.readVarString(decoder) };
    case PRESENCE_MSG_SNAPSHOT: {
      const count = decoding.readVarUint(decoder);
      const sessions: PresenceSession[] = new Array<PresenceSession>(count);
      for (let i = 0; i < count; i++) sessions[i] = readSession(decoder);
      return { type, sessions };
    }
    default:
      throw new Error(`presence codec: unknown message type ${type as number}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience: full-frame helpers including the outer Y_MESSAGE_PRESENCE byte
// ────────────────────────────────────────────────────────────────────────────

import { Y_MESSAGE_PRESENCE } from './message-types';

/**
 * Build a complete WebSocket frame (including the outer multiplex byte) for
 * any presence message. Use this when you don't need to share an `Encoder`
 * with other Yjs writers.
 */
export function encodePresenceFrame(
  write: (inner: encoding.Encoder) => void
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, Y_MESSAGE_PRESENCE);
  write(encoder);
  return encoding.toUint8Array(encoder);
}
