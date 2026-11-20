import { describe, expect, it } from 'bun:test';
import { MIN_CLIENT_VERSION, PROTOCOL_VERSION } from '../src/config/protocol';
import {
  CLIENT_VERSION_PARAM,
  LEGACY_SYNC_PROTOCOL,
  SYNC_PROTOCOL_PARAM,
  checkSyncClient,
  meetsMinimumVersion,
} from '../src/utils/sync-client-gate';

/** A query getter over a plain object, like `c.req.query` / `searchParams.get`. */
const query =
  (params: Record<string, string>) =>
  (name: string): string | null =>
    params[name] ?? null;

describe('checkSyncClient', () => {
  it('accepts a client of the server protocol and version', () => {
    expect(
      checkSyncClient(
        query({ [SYNC_PROTOCOL_PARAM]: String(PROTOCOL_VERSION), [CLIENT_VERSION_PARAM]: '9.9.9' })
      )
    ).toEqual({ ok: true });
  });

  it('counts a client that sends no protocol as the legacy protocol', () => {
    expect(LEGACY_SYNC_PROTOCOL).toBe(1);
    expect(checkSyncClient(query({}), 1).ok).toBe(true);
    // Once the server moves on, builds from before the parameter are refused.
    expect(checkSyncClient(query({}), 2)).toEqual({
      ok: false,
      detail: 'sync protocol 1, server speaks 2',
    });
  });

  it('refuses an older and a newer protocol', () => {
    expect(checkSyncClient(query({ [SYNC_PROTOCOL_PARAM]: '1' }), 2).ok).toBe(false);
    expect(checkSyncClient(query({ [SYNC_PROTOCOL_PARAM]: '3' }), 2).ok).toBe(false);
    expect(checkSyncClient(query({ [SYNC_PROTOCOL_PARAM]: '2' }), 2).ok).toBe(true);
  });

  it('refuses a protocol it cannot read', () => {
    for (const raw of ['', 'two', '1.5', '-1', '1e3', '9999999']) {
      expect({ raw, ok: checkSyncClient(query({ [SYNC_PROTOCOL_PARAM]: raw }), 1).ok }).toEqual({
        raw,
        ok: false,
      });
    }
  });

  it('refuses an app version below the minimum, and judges a missing one by protocol', () => {
    expect(checkSyncClient(query({ [CLIENT_VERSION_PARAM]: '1.1.9' }), 1, '1.2.0')).toEqual({
      ok: false,
      detail: 'client 1.1.9 is older than 1.2.0',
    });
    expect(checkSyncClient(query({ [CLIENT_VERSION_PARAM]: '1.2.0-beta.1' }), 1, '1.2.0').ok).toBe(
      true
    );
    expect(checkSyncClient(query({}), 1, '99.0.0').ok).toBe(true);
  });

  it('keeps the detail it logs short', () => {
    const verdict = checkSyncClient(
      query({ [CLIENT_VERSION_PARAM]: `0.0.1-${'x'.repeat(500)}` }),
      1,
      MIN_CLIENT_VERSION
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.detail.length).toBeLessThan(100);
  });
});

describe('meetsMinimumVersion', () => {
  it('compares MAJOR.MINOR.PATCH only', () => {
    expect(meetsMinimumVersion('1.0.0', '1.0.0')).toBe(true);
    expect(meetsMinimumVersion('1.0.0-beta.1', '1.0.0')).toBe(true);
    expect(meetsMinimumVersion('1.10.0', '1.9.9')).toBe(true);
    expect(meetsMinimumVersion('1.9.9', '1.10.0')).toBe(false);
    expect(meetsMinimumVersion('2.0.0', '1.99.99')).toBe(true);
    expect(meetsMinimumVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('treats an unreadable version as too old and an unreadable minimum as no minimum', () => {
    expect(meetsMinimumVersion('dev', '0.1.0')).toBe(false);
    expect(meetsMinimumVersion('1.0.0', 'none')).toBe(true);
  });
});
