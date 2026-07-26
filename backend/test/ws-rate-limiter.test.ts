import { describe, it, expect } from 'bun:test';
import { checkWsRateLimit } from '../src/durable-objects/ws-rate-limiter';

describe('checkWsRateLimit', () => {
  it('allows the first few upgrades for a documentId', () => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      const result = checkWsRateLimit(map, 'doc', i * 100);
      expect(result.allowed).toBe(true);
    }
  });

  it('throttles the 4th rapid reconnect within the window', () => {
    const map = new Map<string, number[]>();
    // 3 rapid reconnects (allowed)
    for (let i = 0; i < 3; i++) {
      checkWsRateLimit(map, 'doc', i * 100);
    }
    // 4th within the window → throttled
    const result = checkWsRateLimit(map, 'doc', 400);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('allows reconnects after the cooldown elapses', () => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      checkWsRateLimit(map, 'doc', i * 100);
    }
    // Throttled at 400ms
    expect(checkWsRateLimit(map, 'doc', 400).allowed).toBe(false);
    // After 5s cooldown (measured from last attempt at 200ms) → allowed
    const result = checkWsRateLimit(map, 'doc', 200 + 5_001);
    expect(result.allowed).toBe(true);
  });

  it('allows reconnects after the sliding window expires', () => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      checkWsRateLimit(map, 'doc', i * 100);
    }
    // After 10s window (all old entries drop out) → allowed
    const result = checkWsRateLimit(map, 'doc', 10_001);
    expect(result.allowed).toBe(true);
  });

  it('tracks different documentIds independently', () => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      expect(checkWsRateLimit(map, 'doc-a', i * 100).allowed).toBe(true);
    }
    // doc-b is independent — first 3 allowed
    for (let i = 0; i < 3; i++) {
      expect(checkWsRateLimit(map, 'doc-b', i * 100).allowed).toBe(true);
    }
  });

  it('simulates a reconnect storm (100ms apart) and blocks it', () => {
    const map = new Map<string, number[]>();
    // First 3 are allowed
    for (let i = 0; i < 3; i++) {
      expect(checkWsRateLimit(map, 'doc', i * 100).allowed).toBe(true);
    }
    // The storm: every 100ms, should be blocked
    let blocked = 0;
    for (let t = 400; t < 5000; t += 100) {
      const r = checkWsRateLimit(map, 'doc', t);
      if (!r.allowed) blocked++;
    }
    expect(blocked).toBeGreaterThan(10);
    // After cooldown, one is allowed
    const after = checkWsRateLimit(map, 'doc', 200 + 5_001);
    expect(after.allowed).toBe(true);
  });
});
