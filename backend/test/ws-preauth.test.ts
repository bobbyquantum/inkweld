import { describe, expect, it } from 'bun:test';
import {
  MAX_PREAUTH_QUEUED_BYTES,
  MAX_PREAUTH_QUEUED_FRAMES,
  PREAUTH_TIMEOUT_MS,
  preAuthDeadlinePassed,
  preAuthQueueAccepts,
} from '../src/utils/ws-preauth';

describe('pre-auth queue budget', () => {
  it('accepts frames while under both limits', () => {
    expect(preAuthQueueAccepts(0, 0, 100)).toBe(true);
    expect(preAuthQueueAccepts(MAX_PREAUTH_QUEUED_FRAMES - 1, 0, 1)).toBe(true);
    expect(preAuthQueueAccepts(0, MAX_PREAUTH_QUEUED_BYTES - 1, 1)).toBe(true);
  });

  it('rejects once the frame count is reached', () => {
    expect(preAuthQueueAccepts(MAX_PREAUTH_QUEUED_FRAMES, 0, 1)).toBe(false);
  });

  it('rejects a frame that would push the byte total over the cap', () => {
    expect(preAuthQueueAccepts(0, MAX_PREAUTH_QUEUED_BYTES, 1)).toBe(false);
    expect(preAuthQueueAccepts(0, 0, MAX_PREAUTH_QUEUED_BYTES + 1)).toBe(false);
  });

  it('leaves comfortable room for a full initial sync', () => {
    // A real handshake is ~5-15 frames of a few KB each.
    expect(MAX_PREAUTH_QUEUED_FRAMES).toBeGreaterThanOrEqual(32);
    expect(MAX_PREAUTH_QUEUED_BYTES).toBeGreaterThanOrEqual(256 * 1024);
  });
});

describe('pre-auth deadline', () => {
  it('passes exactly at the timeout and not before', () => {
    expect(preAuthDeadlinePassed(1_000, 1_000 + PREAUTH_TIMEOUT_MS - 1)).toBe(false);
    expect(preAuthDeadlinePassed(1_000, 1_000 + PREAUTH_TIMEOUT_MS)).toBe(true);
  });
});
