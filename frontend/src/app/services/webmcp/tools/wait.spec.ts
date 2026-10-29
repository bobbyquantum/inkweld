import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitUntil } from './wait';

describe('waitUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true once the condition holds', async () => {
    let ready = false;
    const result = waitUntil(() => ready, new AbortController().signal);
    ready = true;
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(true);
  });

  it('resolves false after the timeout', async () => {
    const result = waitUntil(() => false, new AbortController().signal, 500);
    await vi.advanceTimersByTimeAsync(600);
    await expect(result).resolves.toBe(false);
  });

  it('rejects when the agent cancels', async () => {
    const controller = new AbortController();
    const result = waitUntil(() => false, controller.signal);
    controller.abort();
    const assertion = expect(result).rejects.toThrow('Cancelled.');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});
