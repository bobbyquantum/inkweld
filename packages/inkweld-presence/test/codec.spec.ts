import { describe, expect, it } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import {
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_LEAVE,
  PRESENCE_MSG_SNAPSHOT,
  PRESENCE_MSG_UPDATE,
  Y_MESSAGE_PRESENCE,
  encodePresenceFrame,
  readPresenceMessage,
  writeHello,
  writeLeave,
  writeSnapshot,
  writeUpdate,
} from '../src/protocol';
import {
  type PresenceLocation,
  type PresenceSelection,
  type PresenceSession,
  type PresenceUpdateFields,
} from '../src/types';

const sampleUser = {
  id: 'user-42',
  username: 'alice',
  color: '#ff8800',
} as const;

const sampleSession: PresenceSession = {
  sessionId: 'sess-abc',
  user: { ...sampleUser },
  status: 'editing',
  location: { kind: 'document', documentId: 'alice:demo:el-1' },
  selection: {
    kind: 'prosemirror',
    documentId: 'alice:demo:el-1',
    anchor: new Uint8Array([1, 2, 3, 4]),
    head: new Uint8Array([5, 6]),
  },
  lastActivityAt: 1_700_000_000_000,
};

function roundTrip(write: (e: encoding.Encoder) => void) {
  const enc = encoding.createEncoder();
  write(enc);
  const bytes = encoding.toUint8Array(enc);
  return readPresenceMessage(decoding.createDecoder(bytes));
}

describe('presence codec', () => {
  it('Y_MESSAGE_PRESENCE is the multiplex byte 100', () => {
    expect(Y_MESSAGE_PRESENCE).toBe(100);
  });

  it('round-trips Hello with all fields', () => {
    const decoded = roundTrip((e) => writeHello(e, sampleSession));
    expect(decoded.type).toBe(PRESENCE_MSG_HELLO);
    if (decoded.type !== PRESENCE_MSG_HELLO) throw new Error('type narrow');
    expect(decoded.session.sessionId).toBe(sampleSession.sessionId);
    expect(decoded.session.user).toEqual(sampleSession.user);
    expect(decoded.session.status).toBe('editing');
    expect(decoded.session.location).toEqual(sampleSession.location);
    expect(decoded.session.lastActivityAt).toBe(sampleSession.lastActivityAt);
    if (decoded.session.selection?.kind !== 'prosemirror') {
      throw new Error('expected prosemirror selection');
    }
    expect(Array.from(decoded.session.selection.anchor)).toEqual([1, 2, 3, 4]);
    expect(Array.from(decoded.session.selection.head)).toEqual([5, 6]);
  });

  it('round-trips Hello without optional selection', () => {
    const session: PresenceSession = {
      sessionId: 's1',
      user: { ...sampleUser },
      status: 'active',
      location: { kind: 'elements' },
      lastActivityAt: 0,
    };
    const decoded = roundTrip((e) => writeHello(e, session));
    if (decoded.type !== PRESENCE_MSG_HELLO) throw new Error('type narrow');
    expect(decoded.session.selection).toBeUndefined();
  });

  it('round-trips Update with partial fields and explicit selection clear', () => {
    const fields: PresenceUpdateFields = {
      status: 'idle',
      selection: null, // explicit clear
    };
    const decoded = roundTrip((e) => writeUpdate(e, 's1', fields));
    if (decoded.type !== PRESENCE_MSG_UPDATE) throw new Error('type narrow');
    expect(decoded.sessionId).toBe('s1');
    expect(decoded.fields.status).toBe('idle');
    expect(decoded.fields.selection).toBeNull();
    expect(decoded.fields.location).toBeUndefined();
    expect(decoded.fields.lastActivityAt).toBeUndefined();
  });

  it('Update with no selection key omits selection on the decoded side', () => {
    const decoded = roundTrip((e) => writeUpdate(e, 's1', { status: 'active' }));
    if (decoded.type !== PRESENCE_MSG_UPDATE) throw new Error('type narrow');
    expect('selection' in decoded.fields).toBe(false);
  });

  it('round-trips every Location variant', () => {
    const locations: PresenceLocation[] = [
      { kind: 'elements' },
      { kind: 'document', documentId: 'a:b:c' },
      { kind: 'timeline', elementId: 'el-1' },
      { kind: 'canvas', elementId: 'el-2' },
      { kind: 'worldbuilding' },
      { kind: 'worldbuilding', schemaId: 'character' },
      { kind: 'media' },
      { kind: 'settings' },
      { kind: 'other', label: 'custom-tab' },
    ];
    for (const location of locations) {
      const decoded = roundTrip((e) =>
        writeUpdate(e, 's1', { location })
      );
      if (decoded.type !== PRESENCE_MSG_UPDATE) throw new Error('type narrow');
      expect(decoded.fields.location).toEqual(location);
    }
  });

  it('round-trips every Selection variant', () => {
    const selections: PresenceSelection[] = [
      {
        kind: 'prosemirror',
        documentId: 'd1',
        anchor: new Uint8Array([0, 0, 1]),
        head: new Uint8Array([0, 0, 2]),
      },
      { kind: 'timeline', elementId: 'el', start: 1.5, end: 7.25 },
      { kind: 'canvas', elementId: 'el', selectedIds: ['a', 'b', 'c'] },
      { kind: 'canvas', elementId: 'el', selectedIds: [] },
      { kind: 'worldbuilding' },
      { kind: 'worldbuilding', schemaId: 'character' },
      { kind: 'worldbuilding', schemaId: 'character', selectedElementId: 'el-9' },
    ];
    for (const selection of selections) {
      const decoded = roundTrip((e) => writeUpdate(e, 's1', { selection }));
      if (decoded.type !== PRESENCE_MSG_UPDATE) throw new Error('type narrow');
      expect(decoded.fields.selection).toEqual(selection);
    }
  });

  it('round-trips Leave', () => {
    const decoded = roundTrip((e) => writeLeave(e, 'goodbye-session'));
    expect(decoded.type).toBe(PRESENCE_MSG_LEAVE);
    if (decoded.type !== PRESENCE_MSG_LEAVE) throw new Error('type narrow');
    expect(decoded.sessionId).toBe('goodbye-session');
  });

  it('round-trips Snapshot with multiple sessions', () => {
    const sessions: PresenceSession[] = [
      sampleSession,
      {
        sessionId: 's2',
        user: { id: '2', username: 'bob', color: '#00aaff' },
        status: 'idle',
        location: { kind: 'timeline', elementId: 'el-x' },
        lastActivityAt: 999,
      },
    ];
    const decoded = roundTrip((e) => writeSnapshot(e, sessions));
    if (decoded.type !== PRESENCE_MSG_SNAPSHOT) throw new Error('type narrow');
    expect(decoded.sessions).toHaveLength(2);
    expect(decoded.sessions[0].sessionId).toBe('sess-abc');
    expect(decoded.sessions[1].user.username).toBe('bob');
  });

  it('round-trips empty Snapshot', () => {
    const decoded = roundTrip((e) => writeSnapshot(e, []));
    if (decoded.type !== PRESENCE_MSG_SNAPSHOT) throw new Error('type narrow');
    expect(decoded.sessions).toEqual([]);
  });

  it('encodePresenceFrame prepends the multiplex byte', () => {
    const frame = encodePresenceFrame((e) => writeLeave(e, 'x'));
    const decoder = decoding.createDecoder(frame);
    expect(decoding.readVarUint(decoder)).toBe(Y_MESSAGE_PRESENCE);
    const inner = readPresenceMessage(decoder);
    expect(inner.type).toBe(PRESENCE_MSG_LEAVE);
  });

  it('throws on unknown top-level message type', () => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 99); // unknown message tag
    const bytes = encoding.toUint8Array(enc);
    expect(() => readPresenceMessage(decoding.createDecoder(bytes))).toThrow(
      /unknown message type/
    );
  });

  it('treats unknown status tags as active for forward compatibility', () => {
    // Hand-craft an Update with an out-of-range status tag.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, PRESENCE_MSG_UPDATE);
    encoding.writeVarString(enc, 's1');
    encoding.writeVarUint(enc, 1); // status present
    encoding.writeVarUint(enc, 99); // unknown tag
    encoding.writeVarUint(enc, 0); // location absent
    encoding.writeVarUint(enc, 0); // selection unset
    encoding.writeVarUint(enc, 0); // lastActivityAt absent

    const decoded = readPresenceMessage(decoding.createDecoder(encoding.toUint8Array(enc)));
    if (decoded.type !== PRESENCE_MSG_UPDATE) throw new Error('type narrow');
    expect(decoded.fields.status).toBe('active');
  });
});
