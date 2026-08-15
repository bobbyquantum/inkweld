import { describe, expect, it } from 'vitest';

import {
  denialReasonForCloseCode,
  HARD_DENIAL_REASONS,
  LONG_BACKOFF_DENIAL_REASONS,
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

describe('denialReasonForCloseCode', () => {
  it('maps the permanent (44xx) close codes to hard denial reasons', () => {
    expect(denialReasonForCloseCode(4401)).toBe('invalid-token');
    expect(denialReasonForCloseCode(4400)).toBe('invalid-document');
    expect(denialReasonForCloseCode(4403)).toBe('forbidden');
    expect(denialReasonForCloseCode(4404)).toBe('project-not-found');
  });

  it('maps the transient (45xx) close codes to long-backoff reasons', () => {
    expect(denialReasonForCloseCode(4500)).toBe('error');
    expect(denialReasonForCloseCode(4529)).toBe('rate-limited');
  });

  it('keeps permanent codes aligned with the hard-denial classifier', () => {
    for (const code of [4400, 4401, 4403, 4404]) {
      const reason = denialReasonForCloseCode(code);
      expect(reason).not.toBeNull();
      expect(HARD_DENIAL_REASONS.has(reason!)).toBe(true);
    }
  });

  it('keeps transient codes aligned with the long-backoff classifier', () => {
    for (const code of [4500, 4529]) {
      const reason = denialReasonForCloseCode(code);
      expect(reason).not.toBeNull();
      expect(LONG_BACKOFF_DENIAL_REASONS.has(reason!)).toBe(true);
    }
  });

  it('returns null for codes that carry no denial', () => {
    expect(denialReasonForCloseCode(1000)).toBeNull();
    expect(denialReasonForCloseCode(1006)).toBeNull();
    expect(denialReasonForCloseCode(1011)).toBeNull();
    // Permanent-band codes we do not use must stay unmapped rather than
    // guessing a reason.
    expect(denialReasonForCloseCode(4402)).toBeNull();
    expect(denialReasonForCloseCode(4499)).toBeNull();
    expect(denialReasonForCloseCode(0)).toBeNull();
  });
});

describe('HARD_DENIAL_REASONS', () => {
  it('treats the known terminal reasons as hard denials', () => {
    expect(HARD_DENIAL_REASONS.has('invalid-token')).toBe(true);
    expect(HARD_DENIAL_REASONS.has('forbidden')).toBe(true);
    expect(HARD_DENIAL_REASONS.has('project-not-found')).toBe(true);
    expect(HARD_DENIAL_REASONS.has('invalid-document')).toBe(true);
  });

  it('does not treat transient reasons as hard denials', () => {
    expect(HARD_DENIAL_REASONS.has('rate-limited')).toBe(false);
    // A server-side failure says nothing about this client's access and
    // routinely self-heals — terminal handling would bench healthy clients.
    expect(HARD_DENIAL_REASONS.has('error')).toBe(false);
  });
});

describe('LONG_BACKOFF_DENIAL_REASONS', () => {
  it('routes throttles and server-side failures to the long backoff', () => {
    expect(LONG_BACKOFF_DENIAL_REASONS.has('rate-limited')).toBe(true);
    expect(LONG_BACKOFF_DENIAL_REASONS.has('error')).toBe(true);
  });

  it('does not overlap the hard (terminal) reasons', () => {
    for (const reason of LONG_BACKOFF_DENIAL_REASONS) {
      expect(HARD_DENIAL_REASONS.has(reason)).toBe(false);
    }
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
