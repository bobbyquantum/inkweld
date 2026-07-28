import { describe, expect, it } from 'vitest';

import {
  HARD_DENIAL_REASONS,
  parseAccessDeniedReason,
  RATE_LIMIT_BACKOFF_MS,
  withJitter,
} from './access-denial';

describe('parseAccessDeniedReason', () => {
  it('parses the raw wire frame form', () => {
    expect(parseAccessDeniedReason('access-denied:error')).toBe('error');
    expect(parseAccessDeniedReason('access-denied:rate-limited')).toBe(
      'rate-limited'
    );
  });

  it('parses the wrapped re-auth callback form', () => {
    expect(parseAccessDeniedReason('Access denied: forbidden')).toBe(
      'forbidden'
    );
  });

  it('trims separators and whitespace around the reason', () => {
    expect(parseAccessDeniedReason('access-denied:  project-not-found')).toBe(
      'project-not-found'
    );
  });

  it('returns "unknown" for a denial with no reason', () => {
    expect(parseAccessDeniedReason('access-denied:')).toBe('unknown');
    expect(parseAccessDeniedReason('Access denied')).toBe('unknown');
  });

  it('returns null for non-denial messages', () => {
    expect(parseAccessDeniedReason('authenticated')).toBeNull();
    expect(parseAccessDeniedReason('')).toBeNull();
    expect(parseAccessDeniedReason('ping')).toBeNull();
  });
});

describe('HARD_DENIAL_REASONS', () => {
  it('treats the known terminal reasons as hard denials', () => {
    expect(HARD_DENIAL_REASONS.has('invalid-token')).toBe(true);
    expect(HARD_DENIAL_REASONS.has('forbidden')).toBe(true);
    expect(HARD_DENIAL_REASONS.has('error')).toBe(true);
  });

  it('does not treat rate-limited as a hard denial (it gets one retry)', () => {
    expect(HARD_DENIAL_REASONS.has('rate-limited')).toBe(false);
  });
});

describe('RATE_LIMIT_BACKOFF_MS', () => {
  it('exceeds the server reconnect cooldown so the retry lands outside it', () => {
    expect(RATE_LIMIT_BACKOFF_MS).toBeGreaterThan(5_000);
  });
});

describe('withJitter', () => {
  it('scales the delay into [0.5*delay, delay) and returns an integer', () => {
    const delay = 10_000;
    for (let i = 0; i < 50; i++) {
      const jittered = withJitter(delay);
      expect(Number.isInteger(jittered)).toBe(true);
      expect(jittered).toBeGreaterThanOrEqual(delay / 2);
      expect(jittered).toBeLessThan(delay);
    }
  });

  it('returns 0 for a zero delay', () => {
    expect(withJitter(0)).toBe(0);
  });
});
