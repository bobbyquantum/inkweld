import { describe, expect, it } from 'bun:test';
import { createDecoder, readVarUint } from 'lib0/decoding';
import {
  encodePresenceFrame,
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_LEAVE,
  PRESENCE_MSG_SNAPSHOT,
  PRESENCE_MSG_UPDATE,
  PRESENCE_KEEPALIVE_PING,
  PRESENCE_KEEPALIVE_PONG,
  readPresenceMessage,
  writeHello,
  writeUpdate,
  type PresenceSession,
} from '@inkweld/presence';

import {
  ProjectPresenceService,
  Y_MESSAGE_PRESENCE,
  isPresenceMessageTag,
  encodeLeaveFrame,
  peekFrameTag,
} from './presence.service';

class MockSocket {
  readonly sent: Uint8Array[] = [];

  send(data: Uint8Array): void {
    this.sent.push(data);
  }
}

function session(sessionId: string, username: string): PresenceSession {
  return {
    sessionId,
    user: { id: username, username, color: '#abcdef' },
    status: 'active',
    location: { kind: 'elements' },
    lastActivityAt: 1,
  };
}

function decode(frame: Uint8Array) {
  const decoder = createDecoder(frame);
  expect(readVarUint(decoder)).toBe(Y_MESSAGE_PRESENCE);
  return readPresenceMessage(decoder);
}

function handle(
  service: ProjectPresenceService,
  projectKey: string,
  socket: MockSocket,
  frame: Uint8Array,
  authUser?: { id: string; username: string }
): void {
  const decoder = createDecoder(frame);
  readVarUint(decoder);
  service.handleMessage(projectKey, socket, decoder, frame, authUser);
}

describe('ProjectPresenceService', () => {
  it('registers hello, sends snapshot to joining socket, and broadcasts hello', () => {
    const service = new ProjectPresenceService();
    const a = new MockSocket();
    const b = new MockSocket();
    const projectKey = 'alice:novel';

    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((encoder) => writeHello(encoder, session('s1', 'alice')))
    );
    handle(
      service,
      projectKey,
      b,
      encodePresenceFrame((encoder) => writeHello(encoder, session('s2', 'bob')))
    );

    const lastSentToA = a.sent.at(-1);
    expect(lastSentToA).toBeDefined();
    expect(lastSentToA && decode(lastSentToA).type).toBe(PRESENCE_MSG_HELLO);
    const bSnapshot = decode(b.sent[0]);
    expect(bSnapshot.type).toBe(PRESENCE_MSG_SNAPSHOT);
    if (bSnapshot.type === PRESENCE_MSG_SNAPSHOT) {
      expect(bSnapshot.sessions.map((s) => s.sessionId)).toEqual(['s1']);
    }
  });

  it('applies updates and rebroadcasts them to peers', () => {
    const service = new ProjectPresenceService();
    const a = new MockSocket();
    const b = new MockSocket();
    const projectKey = 'alice:novel';

    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((e) => writeHello(e, session('s1', 'alice')))
    );
    handle(
      service,
      projectKey,
      b,
      encodePresenceFrame((e) => writeHello(e, session('s2', 'bob')))
    );
    a.sent.length = 0;
    b.sent.length = 0;

    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((encoder) =>
        writeUpdate(encoder, 's1', { status: 'idle', location: { kind: 'media' } })
      )
    );

    expect(b.sent).toHaveLength(1);
    const message = decode(b.sent[0]);
    expect(message.type).toBe(PRESENCE_MSG_UPDATE);
    const stored = service.getProjectSessions(projectKey)?.get('s1');
    expect(stored?.status).toBe('idle');
    expect(stored?.location).toEqual({ kind: 'media' });
  });

  it('removes sockets and broadcasts leave', () => {
    const service = new ProjectPresenceService();
    const a = new MockSocket();
    const b = new MockSocket();
    const projectKey = 'alice:novel';

    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((e) => writeHello(e, session('s1', 'alice')))
    );
    handle(
      service,
      projectKey,
      b,
      encodePresenceFrame((e) => writeHello(e, session('s2', 'bob')))
    );
    b.sent.length = 0;

    service.removeSocket(a);

    expect(service.getProjectSessions(projectKey)?.has('s1')).toBe(false);
    const message = decode(b.sent[0]);
    expect(message.type).toBe(PRESENCE_MSG_LEAVE);
    if (message.type === PRESENCE_MSG_LEAVE) {
      expect(message.sessionId).toBe('s1');
    }
  });

  it('replaces the client-asserted identity with the authenticated user', () => {
    const service = new ProjectPresenceService();
    const mallory = new MockSocket();
    const peer = new MockSocket();
    const projectKey = 'alice:novel';
    handle(
      service,
      projectKey,
      peer,
      encodePresenceFrame((e) => writeHello(e, session('p', 'peer'))),
      {
        id: 'peer',
        username: 'peer',
      }
    );

    // Socket authenticated as "mallory" claims to be "alice".
    handle(
      service,
      projectKey,
      mallory,
      encodePresenceFrame((e) => writeHello(e, session('m1', 'alice'))),
      { id: 'mallory-id', username: 'mallory' }
    );

    const registered = service.getProjectSessions(projectKey)?.get('m1');
    expect(registered?.user).toEqual({ id: 'mallory-id', username: 'mallory', color: '#abcdef' });
    // Peers see the corrected identity, not the raw frame.
    const seenByPeer = decode(peer.sent.at(-1)!);
    expect(seenByPeer.type).toBe(PRESENCE_MSG_HELLO);
    if (seenByPeer.type === PRESENCE_MSG_HELLO) {
      expect(seenByPeer.session.user.username).toBe('mallory');
    }
  });

  it('refuses a Hello whose sessionId is already held by another socket', () => {
    const service = new ProjectPresenceService();
    const victim = new MockSocket();
    const attacker = new MockSocket();
    const projectKey = 'alice:novel';
    handle(
      service,
      projectKey,
      victim,
      encodePresenceFrame((e) => writeHello(e, session('s1', 'victim')))
    );

    handle(
      service,
      projectKey,
      attacker,
      encodePresenceFrame((e) => writeHello(e, session('s1', 'attacker')))
    );

    // The victim's registration is untouched and the attacker got nothing.
    expect(service.getProjectSessions(projectKey)?.get('s1')?.user.username).toBe('victim');
    expect(attacker.sent).toHaveLength(0);

    // The attacker disconnecting must not retire the victim's session either.
    service.removeSocket(attacker);
    expect(service.getProjectSessions(projectKey)?.has('s1')).toBe(true);
    expect(victim.sent.filter((f) => decode(f).type === PRESENCE_MSG_LEAVE)).toHaveLength(0);
  });

  it("applies updates to the sender's own session regardless of the sessionId on the wire", () => {
    const service = new ProjectPresenceService();
    const a = new MockSocket();
    const b = new MockSocket();
    const projectKey = 'alice:novel';
    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((e) => writeHello(e, session('sa', 'a')))
    );
    handle(
      service,
      projectKey,
      b,
      encodePresenceFrame((e) => writeHello(e, session('sb', 'b')))
    );

    // b tries to mark a's session idle.
    handle(
      service,
      projectKey,
      b,
      encodePresenceFrame((e) => writeUpdate(e, 'sa', { status: 'idle' }))
    );

    const sessions = service.getProjectSessions(projectKey)!;
    expect(sessions.get('sa')?.status).toBe('active');
    expect(sessions.get('sb')?.status).toBe('idle');
    // Peers receive the update re-keyed to the real sender.
    const seenByA = decode(a.sent.at(-1)!);
    expect(seenByA.type).toBe(PRESENCE_MSG_UPDATE);
    if (seenByA.type === PRESENCE_MSG_UPDATE) {
      expect(seenByA.sessionId).toBe('sb');
    }
  });

  it('drops an update from a socket that has not said Hello', () => {
    const service = new ProjectPresenceService();
    const a = new MockSocket();
    const stranger = new MockSocket();
    const projectKey = 'alice:novel';
    handle(
      service,
      projectKey,
      a,
      encodePresenceFrame((e) => writeHello(e, session('sa', 'a')))
    );
    const before = a.sent.length;

    handle(
      service,
      projectKey,
      stranger,
      encodePresenceFrame((e) => writeUpdate(e, 'sa', { status: 'idle' }))
    );

    expect(service.getProjectSessions(projectKey)?.get('sa')?.status).toBe('active');
    expect(a.sent).toHaveLength(before);
  });

  it('defines text keepalive messages for Cloudflare auto-response', () => {
    expect(PRESENCE_KEEPALIVE_PING).toBe('inkweld:presence:ping');
    expect(PRESENCE_KEEPALIVE_PONG).toBe('inkweld:presence:pong');
  });

  it('isPresenceMessageTag returns true for Y_MESSAGE_PRESENCE and false otherwise', () => {
    expect(isPresenceMessageTag(Y_MESSAGE_PRESENCE)).toBe(true);
    expect(isPresenceMessageTag(0)).toBe(false);
    expect(isPresenceMessageTag(1)).toBe(false);
  });

  it('encodeLeaveFrame builds a valid Leave frame with the outer multiplex byte', () => {
    const frame = encodeLeaveFrame('sess-xyz');
    const result = peekFrameTag(frame);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe(Y_MESSAGE_PRESENCE);
    // Verify full decode works
    const msg = decode(frame);
    expect(msg.type).toBe(PRESENCE_MSG_LEAVE);
    if (msg.type === PRESENCE_MSG_LEAVE) {
      expect(msg.sessionId).toBe('sess-xyz');
    }
  });

  it('peekFrameTag returns null for an empty frame', () => {
    expect(peekFrameTag(new Uint8Array(0))).toBeNull();
  });

  it('peekFrameTag returns tag and positioned decoder for non-empty frames', () => {
    const frame = encodeLeaveFrame('s1');
    const result = peekFrameTag(frame);
    expect(result).not.toBeNull();
    expect(result!.tag).toBe(Y_MESSAGE_PRESENCE);
  });
});
