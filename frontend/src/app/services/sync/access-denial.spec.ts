import { describe, expect, it } from 'vitest';

import {
  HARD_DENIAL_REASONS,
  parseAccessDeniedReason,
  RATE_LIMIT_BACKOFF_MS,
  rateLimitBackoff,
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

  it('returns "unknown" for a denial with no reason after the delimiter', () => {
    expect(parseAccessDeniedReason('access-denied:')).toBe('unknown');
    expect(parseAccessDeniedReason('Access denied:')).toBe('unknown');
  });

  it('returns null for non-denial messages and delimiter-less look-alikes', () => {
    expect(parseAccessDeniedReason('authenticated')).toBeNull();
    expect(parseAccessDeniedReason('')).toBeNull();
    expect(parseAccessDeniedReason('ping')).toBeNull();
    // The delimiter is required, so these are NOT denials.
    expect(parseAccessDeniedReason('Access denied')).toBeNull();
    expect(parseAccessDeniedReason('access-denieding')).toBeNull();
    expect(parseAccessDeniedReason('Access denieding')).toBeNull();
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
  it('samples the full window [0, delay) and returns an integer', () => {
    const delay = 10_000;
    let sawLowerHalf = false;
    for (let i = 0; i < 200; i++) {
      const jittered = withJitter(delay);
      expect(Number.isInteger(jittered)).toBe(true);
      expect(jittered).toBeGreaterThanOrEqual(0);
      expect(jittered).toBeLessThan(delay);
      if (jittered < delay / 2) sawLowerHalf = true;
    }
    // Full jitter (not upper-half) should reach the lower half of the window.
    expect(sawLowerHalf).toBe(true);
  });

  it('returns 0 for a zero delay', () => {
    expect(withJitter(0)).toBe(0);
  });
});

describe('rateLimitBackoff', () => {
  it('stays within [RATE_LIMIT_BACKOFF_MS/2, RATE_LIMIT_BACKOFF_MS)', () => {
    const floor = RATE_LIMIT_BACKOFF_MS / 2;
    for (let i = 0; i < 200; i++) {
      const delay = rateLimitBackoff();
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(floor);
      expect(delay).toBeLessThan(RATE_LIMIT_BACKOFF_MS);
    }
  });

  it('never drops to or below the server reconnect cooldown', () => {
    for (let i = 0; i < 200; i++) {
      expect(rateLimitBackoff()).toBeGreaterThan(5_000);
    }
  });
});
