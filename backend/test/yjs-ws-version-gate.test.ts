import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { PROTOCOL_VERSION } from '../src/config/protocol';
import { yjsService } from '../src/services/yjs.service';
import { CLIENT_VERSION_PARAM, SYNC_PROTOCOL_PARAM } from '../src/utils/sync-client-gate';
import { WS_CLOSE_VERSION_MISMATCH } from '../src/utils/ws-close-codes';
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
 * The Bun sync route refuses a client whose sync protocol or app version it
 * does not sync with, before any token or document work, and keeps serving
 * the clients it does: the current protocol, and builds from before clients
 * sent one (which count as protocol 1).
 */

/** Whether the shared Bun service holds a document under `documentId`. */
function serviceHolds(documentId: string): boolean {
  return (yjsService as unknown as { docs: Map<string, unknown> }).docs.has(documentId);
}

describe('Yjs WebSocket route client versions', () => {
  let baseUrl = '';
  let fixture: WsFixture;
  const open: CollectedSocket[] = [];

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    fixture = await createWsFixture(baseUrl, 'versiongateuser', 'version-gate');
  });

  afterAll(async () => {
    await removeWsFixture(fixture, open);
    await stopTestServer();
  });

  async function connect(
    query: Record<string, string>,
    documentId = fixture.documentId
  ): Promise<CollectedSocket> {
    const socket = await connectYjsSocket(baseUrl, documentId, query);
    open.push(socket);
    return socket;
  }

  async function expectSyncs(query: Record<string, string>): Promise<void> {
    const socket = await connect(query);
    socket.ws.send(fixture.token);
    await waitForSocket(() => socket.texts.length > 0);
    expect(socket.texts).toEqual(['authenticated']);
  }

  it('syncs a client of the current protocol and version', async () => {
    await expectSyncs({
      [SYNC_PROTOCOL_PARAM]: String(PROTOCOL_VERSION),
      [CLIENT_VERSION_PARAM]: '1.0.0-beta.9',
    });
  });

  it('syncs a build from before clients sent their versions', async () => {
    // Holds while the server speaks protocol 1; bumping it locks these out.
    expect(PROTOCOL_VERSION).toBe(1);
    await expectSyncs({});
  });

  it('closes a client of another protocol, or below the minimum version, before it signs in', async () => {
    const refused = [
      { [SYNC_PROTOCOL_PARAM]: String(PROTOCOL_VERSION + 1) },
      { [SYNC_PROTOCOL_PARAM]: 'garbage' },
      { [SYNC_PROTOCOL_PARAM]: String(PROTOCOL_VERSION), [CLIENT_VERSION_PARAM]: '0.0.1' },
    ];
    // A document no accepted socket opens, so a refused one opening it shows.
    const probeId = `${fixture.documentId.split(':').slice(0, 2).join(':')}:version-gate-probe`;
    await Promise.all(
      refused.map(async (query) => {
        const socket = await connect(query, probeId);
        const closed = await socket.closed;
        expect({ query, code: closed.code, texts: socket.texts }).toEqual({
          query,
          code: WS_CLOSE_VERSION_MISMATCH,
          texts: ['access-denied:version-mismatch'],
        });
      })
    );
    expect(serviceHolds(probeId) || serviceHolds(`${probeId}/`)).toBe(false);
  });
});
