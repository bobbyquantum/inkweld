import { describe, it, expect } from 'bun:test';
import { checkWsRateLimit, WS_RECONNECT_COOLDOWN_MS } from '../src/durable-objects/ws-rate-limiter';

describe('checkWsRateLimit', () => {
  it('allows the first upgrade for a documentId', () => {
    const map = new Map<string, number>();
    const result = checkWsRateLimit(map, 'alice:novel:chapter-1', 1000);
    expect(result.allowed).toBe(true);
    expect(map.get('alice:novel:chapter-1')).toBe(1000);
  });

  it('blocks a second upgrade within the cooldown', () => {
    const map = new Map<string, number>();
    checkWsRateLimit(map, 'doc', 1000);
    const result = checkWsRateLimit(map, 'doc', 1000 + 1_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(WS_RECONNECT_COOLDOWN_MS - 1_000);
    }
  });

  it('allows an upgrade after the cooldown elapses', () => {
    const map = new Map<string, number>();
    checkWsRateLimit(map, 'doc', 1000);
    const result = checkWsRateLimit(map, 'doc', 1000 + WS_RECONNECT_COOLDOWN_MS);
    expect(result.allowed).toBe(true);
    expect(map.get('doc')).toBe(1000 + WS_RECONNECT_COOLDOWN_MS);
  });

  it('tracks different documentIds independently', () => {
    const map = new Map<string, number>();
    const a = checkWsRateLimit(map, 'doc-a', 1000);
    const b = checkWsRateLimit(map, 'doc-b', 1000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('respects a custom cooldown', () => {
    const map = new Map<string, number>();
    checkWsRateLimit(map, 'doc', 1000, 10_000);
    const result = checkWsRateLimit(map, 'doc', 1000 + 5_000, 10_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(5_000);
    }
  });

  it('allows the exact cooldown boundary', () => {
    const map = new Map<string, number>();
    checkWsRateLimit(map, 'doc', 1000);
    const result = checkWsRateLimit(map, 'doc', 1000 + WS_RECONNECT_COOLDOWN_MS);
    expect(result.allowed).toBe(true);
  });

  it('blocks rapid reconnects simulating a storm (100ms apart)', () => {
    const map = new Map<string, number>();
    // First is allowed, rest within cooldown are blocked.
    const first = checkWsRateLimit(map, 'doc', 0);
    expect(first.allowed).toBe(true);
    for (let t = 100; t < 3000; t += 100) {
      const r = checkWsRateLimit(map, 'doc', t);
      expect(r.allowed).toBe(false);
    }
    // After cooldown, allowed again.
    const after = checkWsRateLimit(map, 'doc', 3001);
    expect(after.allowed).toBe(true);
  });
});
