/**
 * Tests for logger output neutralization (CWE-117).
 *
 * Log messages, contexts and correlation IDs routinely derive from
 * user-controlled input (document IDs, usernames, the X-Correlation-ID
 * header). Control characters in that input must never reach the console
 * verbatim: CR/LF can forge additional log lines and ESC/CSI sequences can
 * inject terminal escape codes.
 */
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { logger } from './logger.service';

const originalNodeEnv = process.env.NODE_ENV;

type Spy = ReturnType<typeof spyOn>;

let logSpy: Spy;
let warnSpy: Spy;
let errorSpy: Spy;

function captured(spy: Spy): string[] {
  return spy.mock.calls.map((call: unknown[]) => String(call[0]));
}

/** True if the text still contains any raw C0/DEL/C1 control character. */
function containsControlChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
      return true;
    }
  }
  return false;
}

beforeEach(() => {
  logSpy = spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  process.env.NODE_ENV = originalNodeEnv;
});

describe('logger control-character neutralization (dev output)', () => {
  it('escapes CR/LF and ANSI escapes in the message', () => {
    logger.info('Auth', 'login failed for alice\ninjected\u001b[31mRED\r\nFAKE');

    const [line] = captured(logSpy);
    expect(line).toBeDefined();
    // Raw newline/CR must not survive between message fragments
    expect(line.includes('alice\ninjected')).toBe(false);
    expect(line.includes('\r\nFAKE')).toBe(false);
    // Payload stays visible as escaped sequences
    expect(line.includes('alice\\u000ainjected')).toBe(true);
    expect(line.includes('\\u001b[31mRED')).toBe(true);
    expect(line.includes('\\u000d\\u000aFAKE')).toBe(true);
  });

  it('escapes control characters in the context and correlation ID', () => {
    logger.warn('HTTP\u001b[2m', 'request failed', {}, 'a\rb');

    const [line] = captured(warnSpy);
    expect(line).toBeDefined();
    expect(line.includes('HTTP\u001b[2m')).toBe(false);
    expect(line.includes('HTTP\\u001b[2m]')).toBe(true);
    expect(line.includes('a\rb')).toBe(false);
    expect(line.includes('a\\u000db')).toBe(true);
  });

  it('escapes newlines in error messages and stacks', () => {
    logger.error('Yjs', 'sync failed', new Error('bad documentId: x\ny'));

    const [logLine, stackLine] = captured(errorSpy);
    expect(logLine).toContain('sync failed');
    expect(stackLine.includes('x\ny')).toBe(false);
    expect(stackLine.includes('x\\u000ay')).toBe(true);
  });

  it('leaves clean messages untouched', () => {
    logger.info('Auth', 'user alice logged in');

    const [line] = captured(logSpy);
    expect(line.includes('user alice logged in')).toBe(true);
  });
});

describe('logger control-character neutralization (production JSON output)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('emits a single JSON line with escaped control characters', () => {
    logger.info('Auth', 'login failed for bob\ninjected\u0085\u001b[31mRED', {
      attempted: true,
    });

    const [raw] = captured(logSpy);
    expect(raw).toBeDefined();
    // The emitted line must contain no raw control characters at all
    expect(containsControlChars(raw)).toBe(false);

    const entry = JSON.parse(raw);
    expect(entry.message).toBe('login failed for bob\\u000ainjected\\u0085\\u001b[31mRED');
    expect(entry.data).toEqual({ attempted: true });
  });

  it('escapes the correlation ID (sourced from the X-Correlation-ID header)', () => {
    logger.warn('HTTP', 'bad request', {}, 'corr\u000a\u000dforged');

    const [raw] = captured(warnSpy);
    expect(containsControlChars(raw)).toBe(false);

    const entry = JSON.parse(raw);
    expect(entry.correlationId).toBe('corr\\u000a\\u000dforged');
  });

  it('escapes error text in the JSON entry', () => {
    logger.error('Yjs', 'sync failed', new Error('doc\nbomb'));

    const [raw] = captured(errorSpy);
    expect(containsControlChars(raw)).toBe(false);

    const entry = JSON.parse(raw);
    expect(entry.error.message).toBe('doc\\u000abomb');
    expect(entry.error.stack).not.toMatch(/\n/);
  });

  it('escapes non-Error thrown values', () => {
    logger.error('Yjs', 'sync failed', 'raw failure\nwith newline');

    const [raw] = captured(errorSpy);
    expect(containsControlChars(raw)).toBe(false);

    const entry = JSON.parse(raw);
    // String errors are sanitized directly (not JSON-quoted by formatError)
    expect(entry.error.message).toBe('raw failure\\u000awith newline');
  });
});
