import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { getDatabase } from '../src/db/index';
import { projectCollaborators, projects } from '../src/db/schema/index';
import { enablePasswordLoginForTests, startTestServer, stopTestServer } from './server-test-helper';
import {
  connectYjsSocket,
  createWsFixture,
  removeWsFixture,
  waitForSocket,
  type CollectedSocket,
  type WsFixture,
} from './ws-test-helper';

/**
 * A read-only viewer's socket on the Bun route may ask for the document
 * (sync step 1) and send awareness, and nothing else reaches the document.
 *
 * The sync handler reads the message type and the sync sub-type with lib0's
 * `readVarUint`, which also accepts a padded varuint (`0x82 0x00` is 2), so
 * an update can be written more than one way. These tests send updates in
 * each form over the real route, then read the server's copy back with a
 * sync step 1 on the same socket: frames on one socket are handled in order,
 * so the reply shows whether anything sent before it was applied.
 */

const OWNER = 'viewerwsowner';
const VIEWER = 'viewerwsviewer';
const SLUG = 'viewer-ws';

/** A Yjs update that writes `text` into the `probe` text of a fresh doc. */
function probeUpdate(text: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText('probe').insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

/**
 * A sync update frame whose message type and sync sub-type are written as
 * the given bytes, followed by the update.
 */
function updateFrame(typeBytes: number[], text: string): Uint8Array {
  const encoder = encoding.createEncoder();
  for (const byte of typeBytes) encoding.writeUint8(encoder, byte);
  encoding.writeVarUint8Array(encoder, probeUpdate(text));
  return encoding.toUint8Array(encoder);
}

/** The ways one sync update frame can be written. */
const UPDATE_ENCODINGS: { name: string; typeBytes: number[] }[] = [
  { name: 'canonical', typeBytes: [0x00, 0x02] },
  { name: 'padded sub-type', typeBytes: [0x00, 0x82, 0x00] },
  { name: 'padded message type', typeBytes: [0x80, 0x00, 0x02] },
];

function syncStep1(): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, new Y.Doc());
  return encoding.toUint8Array(encoder);
}

/** Collect the sync-step-2 replies the server sends to `socket`. */
function collectStep2Replies(socket: CollectedSocket): Uint8Array[] {
  const replies: Uint8Array[] = [];
  socket.ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') return;
    const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));
    if (decoding.readVarUint(decoder) !== 0) return;
    if (decoding.readVarUint(decoder) !== 1) return;
    replies.push(decoding.readVarUint8Array(decoder));
  });
  return replies;
}

/** The `probe` text in the server's copy, as a step-2 reply carries it. */
function probeText(reply: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, reply);
  return doc.getText('probe').toString();
}

describe('Yjs WebSocket read-only viewer gate', () => {
  let baseUrl = '';
  let owner: WsFixture;
  let viewer: WsFixture;
  let projectId = '';
  const open: CollectedSocket[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    owner = await createWsFixture(baseUrl, OWNER, SLUG);
    viewer = await createWsFixture(baseUrl, VIEWER, `${SLUG}-own`);

    const db = getDatabase();
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.userId, owner.userId), eq(projects.slug, SLUG)));
    projectId = project.id;
    await db.insert(projectCollaborators).values({
      projectId,
      userId: viewer.userId,
      collaboratorType: 'user',
      role: 'viewer',
      status: 'accepted',
      invitedBy: owner.userId,
      invitedAt: Date.now(),
      acceptedAt: Date.now(),
    });
  });

  afterAll(async () => {
    await getDatabase()
      .delete(projectCollaborators)
      .where(eq(projectCollaborators.projectId, projectId));
    await removeWsFixture(viewer, []);
    await removeWsFixture(owner, open);
    await stopTestServer();
  });

  /** Open a socket on the owner's elements doc and sign in with `token`. */
  async function connect(
    token: string
  ): Promise<{ socket: CollectedSocket; replies: Uint8Array[] }> {
    const socket = await connectYjsSocket(baseUrl, owner.documentId);
    open.push(socket);
    const replies = collectStep2Replies(socket);
    socket.ws.send(token);
    await waitForSocket(() => socket.texts.includes('authenticated'));
    return { socket, replies };
  }

  it('applies every encoding of an update from the owner', async () => {
    const { socket, replies } = await connect(owner.token);
    for (const { name, typeBytes } of UPDATE_ENCODINGS) {
      socket.ws.send(updateFrame(typeBytes, `[owner ${name}]`));
    }
    socket.ws.send(syncStep1());
    await waitForSocket(() => replies.length > 0);

    const text = probeText(replies[0]);
    for (const { name } of UPDATE_ENCODINGS) {
      expect(text).toContain(`[owner ${name}]`);
    }
  });

  it('drops every encoding of an update from a viewer once signed in', async () => {
    const { socket, replies } = await connect(viewer.token);
    for (const { name, typeBytes } of UPDATE_ENCODINGS) {
      socket.ws.send(updateFrame(typeBytes, `[viewer live ${name}]`));
    }
    socket.ws.send(syncStep1());
    await waitForSocket(() => replies.length > 0);

    expect(socket.texts).toEqual(['authenticated']);
    expect(probeText(replies[0])).not.toContain('viewer');
  });

  it('drops every encoding of an update a viewer queues before signing in', async () => {
    const socket = await connectYjsSocket(baseUrl, owner.documentId);
    open.push(socket);
    const replies = collectStep2Replies(socket);
    // Queued with the read request, so the reply comes after the drain.
    for (const { name, typeBytes } of UPDATE_ENCODINGS) {
      socket.ws.send(updateFrame(typeBytes, `[viewer queued ${name}]`));
    }
    socket.ws.send(syncStep1());
    socket.ws.send(viewer.token);
    await waitForSocket(() => replies.length > 0);

    expect(socket.texts).toEqual(['authenticated']);
    expect(probeText(replies[0])).not.toContain('viewer');
  });
});
