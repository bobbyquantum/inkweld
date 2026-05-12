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

import { ProjectPresenceService, Y_MESSAGE_PRESENCE } from './presence.service';

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
  frame: Uint8Array
): void {
  const decoder = createDecoder(frame);
  readVarUint(decoder);
  service.handleMessage(projectKey, socket, decoder, frame);
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

  it('defines text keepalive messages for Cloudflare auto-response', () => {
    expect(PRESENCE_KEEPALIVE_PING).toBe('inkweld:presence:ping');
    expect(PRESENCE_KEEPALIVE_PONG).toBe('inkweld:presence:pong');
  });
});
