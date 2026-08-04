import { describe, it, expect } from 'bun:test';
import { safeSend, safeClose } from '../src/utils/ws-guards';

/**
 * Regression tests for the WebSocket guard helpers.
 *
 * Background: the async auth path of the Yjs Durable Object used unguarded
 * `ws.send()`/`ws.close()` after `await` points. When a client disconnected
 * during a token/DB lookup the socket was already closed, so `send()` threw
 * `Can't call WebSocket send() after close()`. workerd surfaces that as an
 * uncaught error that takes the whole DO down — the recurring Wrangler e2e
 * flake (backend dies mid-run, every subsequent test fails with
 * ECONNREFUSED ::1:9333). These helpers must never throw and must signal a
 * closed socket so callers can abort per-connection work.
 */

/** Minimal WebSocket stand-in with mutable readyState + spy send/close. */
function makeSocket(initialState: number) {
  const calls: { send: string[]; close: Array<[number | undefined, string | undefined]> } = {
    send: [],
    close: [],
  };
  const ws = {
    readyState: initialState,
    send(msg: string) {
      if (this.readyState !== WebSocket.OPEN) {
        throw new Error(`Can't call WebSocket send() after close(). (state=${this.readyState})`);
      }
      calls.send.push(msg);
    },
    close(code?: number, reason?: string) {
      calls.close.push([code, reason]);
      this.readyState = WebSocket.CLOSED;
    },
  };
  return { ws, calls };
}

describe('safeSend', () => {
  it('returns true and sends when the socket is open', () => {
    const { ws, calls } = makeSocket(WebSocket.OPEN);
    expect(safeSend(ws, 'authenticated')).toBe(true);
    expect(calls.send).toEqual(['authenticated']);
  });

  it('returns false and does not send when the socket is CLOSING', () => {
    const { ws, calls } = makeSocket(WebSocket.CLOSING);
    expect(safeSend(ws, 'authenticated')).toBe(false);
    expect(calls.send).toEqual([]);
  });

  it('returns false and does not send when the socket is CLOSED', () => {
    const { ws, calls } = makeSocket(WebSocket.CLOSED);
    expect(safeSend(ws, 'authenticated')).toBe(false);
    expect(calls.send).toEqual([]);
  });

  it('returns false when send throws (socket died mid-flight)', () => {
    const { ws, calls } = makeSocket(WebSocket.OPEN);
    // Force a throw on the open socket (simulates a send failing mid-flight).
    ws.send = () => {
      throw new Error('broken pipe');
    };
    expect(safeSend(ws, 'sync')).toBe(false);
    expect(calls.send).toEqual([]);
  });

  it('never throws regardless of socket state', () => {
    for (const state of [WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED]) {
      const { ws } = makeSocket(state);
      expect(() => safeSend(ws, 'x')).not.toThrow();
    }
  });
});

describe('safeClose', () => {
  it('closes an open socket with code and reason', () => {
    const { ws, calls } = makeSocket(WebSocket.OPEN);
    safeClose(ws, 4001, 'Invalid token');
    expect(calls.close).toEqual([[4001, 'Invalid token']]);
  });

  it('does not close a CLOSING socket', () => {
    const { ws, calls } = makeSocket(WebSocket.CLOSING);
    safeClose(ws, 4001, 'Invalid token');
    expect(calls.close).toEqual([]);
  });

  it('does not close a CLOSED socket', () => {
    const { ws, calls } = makeSocket(WebSocket.CLOSED);
    safeClose(ws, 4001, 'Invalid token');
    expect(calls.close).toEqual([]);
  });

  it('swallows a close() throw (socket already gone)', () => {
    const { ws, calls } = makeSocket(WebSocket.OPEN);
    ws.close = () => {
      throw new Error('already closed');
    };
    expect(() => safeClose(ws, 4001, 'x')).not.toThrow();
    expect(calls.close).toEqual([]);
  });
});
