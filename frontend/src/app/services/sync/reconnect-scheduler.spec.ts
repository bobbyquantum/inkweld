import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initialConnectDenialReason,
  type ReconnectAttemptResult,
  ReconnectScheduler,
  retryAfterInitialConnectFailure,
} from './reconnect-scheduler';

function setOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    value: online,
    configurable: true,
  });
}

/** An attempt whose result each test decides, one call at a time. */
function controllableAttempt() {
  const pending: ((result: ReconnectAttemptResult) => void)[] = [];
  const attempt = vi.fn(
    () =>
      new Promise<ReconnectAttemptResult>(resolve => {
        pending.push(resolve);
      })
  );
  const settle = async (result: ReconnectAttemptResult) => {
    pending.shift()?.(result);
    // Let runAttempt's continuation run.
    await Promise.resolve();
    await Promise.resolve();
  };
  return { attempt, settle };
}

describe('ReconnectScheduler', () => {
  let scheduler: ReconnectScheduler | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
    vi.useRealTimers();
    setOnline(true);
  });

  it('waits for the online event while offline, then attempts once', async () => {
    setOnline(false);
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt, baseDelayMs: 1000 });
    scheduler.start();

    // However long the network is down, nothing is attempted.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).not.toHaveBeenCalled();

    setOnline(true);
    globalThis.dispatchEvent(new Event('online'));
    expect(attempt).toHaveBeenCalledTimes(1);

    await settle('connected');
    expect(scheduler.isActive).toBe(false);

    // Stopped: later network signals start nothing.
    globalThis.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('backs off with jitter between failed attempts, capped', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({
      attempt,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
    });
    scheduler.start();

    // First step: between half and all of the base delay.
    await vi.advanceTimersByTimeAsync(499);
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    expect(attempt).toHaveBeenCalledTimes(1);

    // Second step: base × 2 = 2000ms → at least 1000ms.
    await settle('retry');
    await vi.advanceTimersByTimeAsync(999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(attempt).toHaveBeenCalledTimes(2);

    // Third and later steps stay at the 4000ms cap.
    for (let i = 3; i <= 6; i++) {
      await settle('retry');
      await vi.advanceTimersByTimeAsync(1999);
      expect(attempt).toHaveBeenCalledTimes(i - 1);
      await vi.advanceTimersByTimeAsync(2001);
      expect(attempt).toHaveBeenCalledTimes(i);
    }
  });

  it('runs one attempt at a time', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt });
    scheduler.start();

    scheduler.retryNow('button');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(scheduler.isAttemptInFlight).toBe(true);

    // Retry pressed again, network flaps, tab refocused: still one attempt.
    scheduler.retryNow('button');
    globalThis.dispatchEvent(new Event('online'));
    globalThis.dispatchEvent(new Event('focus'));
    expect(attempt).toHaveBeenCalledTimes(1);

    await settle('connected');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('honours a server cooldown over network signals', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt });
    scheduler.start();
    scheduler.retryNow();
    await settle({ retryAfterMs: 30_000 });

    globalThis.dispatchEvent(new Event('online'));
    scheduler.retryNow();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(attempt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('throttles attempts from tab focus', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({
      attempt,
      baseDelayMs: 60_000,
      minTriggerIntervalMs: 5000,
    });
    scheduler.start();

    globalThis.dispatchEvent(new Event('focus'));
    expect(attempt).toHaveBeenCalledTimes(1);
    await settle('retry');

    globalThis.dispatchEvent(new Event('focus'));
    expect(attempt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    globalThis.dispatchEvent(new Event('focus'));
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('retries when the tab becomes visible', () => {
    const { attempt } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt, baseDelayMs: 60_000 });
    scheduler.start();
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');

    document.dispatchEvent(new Event('visibilitychange'));
    expect(attempt).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(attempt).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('stops for good on a stop result', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt });
    scheduler.start();
    scheduler.retryNow();
    await settle('stop');

    expect(scheduler.isActive).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('treats a throwing attempt as a failure to retry', async () => {
    const attempt = vi
      .fn<() => Promise<ReconnectAttemptResult>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('connected');
    scheduler = new ReconnectScheduler({ attempt, baseDelayMs: 1000 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(scheduler.isActive).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(scheduler.isActive).toBe(false);
  });

  it('ignores the result of an attempt that finishes after stop()', async () => {
    const { attempt, settle } = controllableAttempt();
    scheduler = new ReconnectScheduler({ attempt, baseDelayMs: 1000 });
    scheduler.start();
    scheduler.retryNow();
    scheduler.stop();

    await settle('retry');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('initial connect failure helpers', () => {
  it('reads the denial reason from the handshake rejection', () => {
    expect(
      initialConnectDenialReason(
        new Error('WebSocket authentication denied: rate-limited')
      )
    ).toBe('rate-limited');
    expect(
      initialConnectDenialReason(
        new Error('WebSocket connection error: Connection error')
      )
    ).toBeNull();
  });

  it('maps failures to a follow-up', () => {
    expect(
      retryAfterInitialConnectFailure(
        new Error('WebSocket connection error: Connection error')
      )
    ).toBe('retry');
    expect(
      retryAfterInitialConnectFailure(
        new Error('WebSocket authentication denied: invalid-token')
      )
    ).toBe('stop');
    const throttled = retryAfterInitialConnectFailure(
      new Error('WebSocket authentication denied: rate-limited')
    );
    expect(throttled).toEqual({ retryAfterMs: expect.any(Number) });
  });
});
