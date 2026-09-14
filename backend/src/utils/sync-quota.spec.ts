import { describe, it, expect } from 'bun:test';
import {
  DEFAULT_SYNC_QUOTA_BYTES,
  MAX_SYNC_QUOTA_BYTES,
  parseSyncQuotaBytes,
  resolveSyncQuotaBytes,
} from './sync-quota';

describe('sync-quota constants', () => {
  it('defaults to 100 MB', () => {
    expect(DEFAULT_SYNC_QUOTA_BYTES).toBe(104857600);
  });
});

describe('parseSyncQuotaBytes', () => {
  it('accepts numeric strings and numbers', () => {
    expect(parseSyncQuotaBytes('104857600')).toBe(104857600);
    expect(parseSyncQuotaBytes(1024)).toBe(1024);
    expect(parseSyncQuotaBytes(' 2048 ')).toBe(2048);
  });

  it('preserves an explicit zero allowance', () => {
    expect(parseSyncQuotaBytes(0)).toBe(0);
    expect(parseSyncQuotaBytes('0')).toBe(0);
  });

  it('floors fractional values', () => {
    expect(parseSyncQuotaBytes(1024.9)).toBe(1024);
  });

  it('rejects absent or unusable values', () => {
    expect(parseSyncQuotaBytes(null)).toBeUndefined();
    expect(parseSyncQuotaBytes(undefined)).toBeUndefined();
    expect(parseSyncQuotaBytes('')).toBeUndefined();
    expect(parseSyncQuotaBytes('   ')).toBeUndefined();
    expect(parseSyncQuotaBytes('not-a-number')).toBeUndefined();
    expect(parseSyncQuotaBytes(NaN)).toBeUndefined();
    expect(parseSyncQuotaBytes(Infinity)).toBeUndefined();
    expect(parseSyncQuotaBytes(-1)).toBeUndefined();
    expect(parseSyncQuotaBytes('-5')).toBeUndefined();
    expect(parseSyncQuotaBytes({})).toBeUndefined();
  });

  it('rejects values above the 1 TiB ceiling', () => {
    expect(parseSyncQuotaBytes(MAX_SYNC_QUOTA_BYTES)).toBe(MAX_SYNC_QUOTA_BYTES);
    expect(parseSyncQuotaBytes(MAX_SYNC_QUOTA_BYTES + 1)).toBeUndefined();
  });
});

describe('resolveSyncQuotaBytes', () => {
  it('prefers a valid per-user override', () => {
    expect(resolveSyncQuotaBytes(5_000_000, '104857600')).toBe(5_000_000);
    expect(resolveSyncQuotaBytes('250', '104857600')).toBe(250);
  });

  it('preserves a per-user zero override instead of treating it as unset', () => {
    expect(resolveSyncQuotaBytes(0, '104857600')).toBe(0);
  });

  it('falls back to the instance default when there is no override', () => {
    expect(resolveSyncQuotaBytes(null, '2048')).toBe(2048);
    expect(resolveSyncQuotaBytes(undefined, '2048')).toBe(2048);
  });

  it('ignores an invalid override and uses the instance default', () => {
    expect(resolveSyncQuotaBytes(-1, '2048')).toBe(2048);
    expect(resolveSyncQuotaBytes(NaN, '2048')).toBe(2048);
  });

  it('falls back to the hardcoded default when both are unusable', () => {
    expect(resolveSyncQuotaBytes(null, undefined)).toBe(DEFAULT_SYNC_QUOTA_BYTES);
    expect(resolveSyncQuotaBytes(null, 'garbage')).toBe(DEFAULT_SYNC_QUOTA_BYTES);
    expect(resolveSyncQuotaBytes(null, -10)).toBe(DEFAULT_SYNC_QUOTA_BYTES);
    expect(resolveSyncQuotaBytes(null, '')).toBe(DEFAULT_SYNC_QUOTA_BYTES);
  });
});
