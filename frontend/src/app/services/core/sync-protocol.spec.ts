import { describe, expect, it, vi } from 'vitest';

import {
  CLIENT_PROTOCOL_VERSION,
  getClientVersion,
  onSyncVersionMismatch,
  reportSyncVersionMismatch,
  withSyncClientParams,
} from './sync-protocol';

describe('withSyncClientParams', () => {
  const params = () =>
    `syncProtocol=${CLIENT_PROTOCOL_VERSION}&clientVersion=${encodeURIComponent(getClientVersion())}`;

  it('puts the versions right after the "?", keeping the document id last', () => {
    // y-websocket appends "/" + room to the URL, which the server reads as
    // part of the last parameter: that has to stay the document id.
    expect(
      withSyncClientParams('wss://host/api/v1/ws/yjs?documentId=a:b:c')
    ).toBe(`wss://host/api/v1/ws/yjs?${params()}&documentId=a:b:c`);
  });

  it('adds a query when the URL has none, or an empty one', () => {
    expect(withSyncClientParams('wss://host/ws')).toBe(
      `wss://host/ws?${params()}`
    );
    expect(withSyncClientParams('wss://host/ws?')).toBe(
      `wss://host/ws?${params()}`
    );
  });

  it('keeps every existing parameter in order', () => {
    expect(withSyncClientParams('ws://h/p?x=1&documentId=d')).toBe(
      `ws://h/p?${params()}&x=1&documentId=d`
    );
  });
});

describe('sync version mismatch listeners', () => {
  it('calls each listener until it is stopped, even when one throws', () => {
    const failing = vi.fn(() => {
      throw new Error('listener failed');
    });
    const listener = vi.fn();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stopFailing = onSyncVersionMismatch(failing);
    const stop = onSyncVersionMismatch(listener);

    reportSyncVersionMismatch();
    stopFailing();
    stop();
    reportSyncVersionMismatch();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});
