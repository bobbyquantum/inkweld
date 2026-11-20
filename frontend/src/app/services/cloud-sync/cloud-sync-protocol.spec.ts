import { describe, expect, it } from 'vitest';

import {
  CLOUD_SYNC_PROTOCOL_PATH,
  CloudSyncProtocolError,
  ensureCloudSyncProtocol,
  parseCloudSyncProtocol,
} from './cloud-sync-protocol';
import {
  RemoteConflictError,
  type RemoteFileInfo,
} from './remote-store.interface';
import { InMemoryRemoteStore } from './testing/in-memory-remote-store';

const marker = (protocol: unknown) => JSON.stringify({ protocol });

describe('parseCloudSyncProtocol', () => {
  it('reads a positive integer protocol and ignores other fields', () => {
    expect(
      parseCloudSyncProtocol('{"protocol":3,"updatedAt":"x","more":1}')
    ).toBe(3);
  });

  it('rejects anything else', () => {
    for (const text of [
      '',
      'not json',
      'null',
      '{}',
      marker(0),
      marker(1.5),
      marker('2'),
      marker(-1),
    ]) {
      expect({ text, protocol: parseCloudSyncProtocol(text) }).toEqual({
        text,
        protocol: null,
      });
    }
  });
});

describe('ensureCloudSyncProtocol', () => {
  it('writes nothing to a folder without a marker while the protocol is 1', async () => {
    const store = new InMemoryRemoteStore();
    await ensureCloudSyncProtocol(store, 1);
    expect(store.files.has(CLOUD_SYNC_PROTOCOL_PATH)).toBe(false);
  });

  it('accepts a folder of the same protocol without writing', async () => {
    const store = new InMemoryRemoteStore();
    store.seed(CLOUD_SYNC_PROTOCOL_PATH, marker(2));
    const before = store.files.get(CLOUD_SYNC_PROTOCOL_PATH)?.version;
    await ensureCloudSyncProtocol(store, 2);
    expect(store.files.get(CLOUD_SYNC_PROTOCOL_PATH)?.version).toBe(before);
  });

  it('raises the marker of a folder an older protocol wrote', async () => {
    const store = new InMemoryRemoteStore();
    await ensureCloudSyncProtocol(store, 2);
    expect(parseCloudSyncProtocol(store.text(CLOUD_SYNC_PROTOCOL_PATH)!)).toBe(
      2
    );

    store.seed(CLOUD_SYNC_PROTOCOL_PATH, marker(2));
    await ensureCloudSyncProtocol(store, 3);
    expect(parseCloudSyncProtocol(store.text(CLOUD_SYNC_PROTOCOL_PATH)!)).toBe(
      3
    );
  });

  it('stops an older build, on a newer or an unreadable marker', async () => {
    const store = new InMemoryRemoteStore();
    store.seed(CLOUD_SYNC_PROTOCOL_PATH, marker(2));
    const newer = await ensureCloudSyncProtocol(store, 1).catch(
      (e: unknown) => e
    );
    expect(newer).toBeInstanceOf(CloudSyncProtocolError);
    expect(newer).toMatchObject({ remoteProtocol: 2, localProtocol: 1 });

    store.seed(CLOUD_SYNC_PROTOCOL_PATH, '{"protocol":"two"}');
    const unreadable = await ensureCloudSyncProtocol(store, 5).catch(
      (e: unknown) => e
    );
    expect(unreadable).toMatchObject({
      remoteProtocol: null,
      localProtocol: 5,
    });
    // Never overwritten by the build that can't read it.
    expect(store.text(CLOUD_SYNC_PROTOCOL_PATH)).toBe('{"protocol":"two"}');
  });

  it('judges again by what another device wrote in between', async () => {
    const store = new InMemoryRemoteStore();
    store.seed(CLOUD_SYNC_PROTOCOL_PATH, marker(1));
    const put = store.put.bind(store);
    let raced = false;
    store.put = (path, content, options): Promise<RemoteFileInfo> => {
      if (!raced && path === CLOUD_SYNC_PROTOCOL_PATH) {
        raced = true;
        // A newer device raises the marker just before this write lands.
        store.seed(CLOUD_SYNC_PROTOCOL_PATH, marker(4));
        return Promise.reject(new RemoteConflictError(path));
      }
      return put(path, content, options);
    };
    await expect(ensureCloudSyncProtocol(store, 2)).rejects.toBeInstanceOf(
      CloudSyncProtocolError
    );
    expect(parseCloudSyncProtocol(store.text(CLOUD_SYNC_PROTOCOL_PATH)!)).toBe(
      4
    );
  });
});
