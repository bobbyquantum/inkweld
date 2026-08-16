import { describe, expect, it } from 'bun:test';
import {
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_INVALID_DOCUMENT,
  WS_CLOSE_INVALID_TOKEN,
  WS_CLOSE_PROJECT_NOT_FOUND,
  WS_CLOSE_RATE_LIMITED,
  WS_CLOSE_SERVER_ERROR,
} from '../src/utils/ws-close-codes';

/**
 * y-websocket 3.1 treats the 4400-4499 band as TERMINAL: the provider stops
 * its internal reconnect loop and emits `closed`. The 4500-4599 band is the
 * transient "try again later" range. These tests pin that mapping so a future
 * close code can't silently move a transient failure into the permanent band
 * (which would bench healthy clients) or a hard denial out of it (which would
 * let y-websocket storm the server).
 */

const isPermanent = (code: number) => code >= 4400 && code < 4500;
const isTransient = (code: number) => code >= 4500 && code < 4600;

describe('ws-close-codes', () => {
  it('puts every hard denial in the permanent (44xx) band', () => {
    for (const code of [
      WS_CLOSE_INVALID_TOKEN,
      WS_CLOSE_INVALID_DOCUMENT,
      WS_CLOSE_FORBIDDEN,
      WS_CLOSE_PROJECT_NOT_FOUND,
    ]) {
      expect(isPermanent(code)).toBe(true);
    }
  });

  it('puts every retryable failure in the transient (45xx) band', () => {
    for (const code of [WS_CLOSE_SERVER_ERROR, WS_CLOSE_RATE_LIMITED]) {
      expect(isTransient(code)).toBe(true);
    }
  });

  it('keeps the two bands disjoint', () => {
    const permanent = [
      WS_CLOSE_INVALID_TOKEN,
      WS_CLOSE_INVALID_DOCUMENT,
      WS_CLOSE_FORBIDDEN,
      WS_CLOSE_PROJECT_NOT_FOUND,
    ];
    const transient = [WS_CLOSE_SERVER_ERROR, WS_CLOSE_RATE_LIMITED];
    for (const code of transient) {
      expect(permanent).not.toContain(code);
    }
  });

  it('uses distinct codes for every condition', () => {
    const all = [
      WS_CLOSE_INVALID_TOKEN,
      WS_CLOSE_INVALID_DOCUMENT,
      WS_CLOSE_FORBIDDEN,
      WS_CLOSE_PROJECT_NOT_FOUND,
      WS_CLOSE_SERVER_ERROR,
      WS_CLOSE_RATE_LIMITED,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
