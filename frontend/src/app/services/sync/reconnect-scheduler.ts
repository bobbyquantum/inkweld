import {
  HARD_DENIAL_REASONS,
  LONG_BACKOFF_DENIAL_REASONS,
  rateLimitBackoff,
  withJitter,
} from './access-denial';

/**
 * What one reconnect attempt achieved.
 *
 * - `connected`: done, the scheduler stops.
 * - `stop`: retrying is pointless (no token, terminal denial, torn down).
 * - `retry`: try again after the next backoff step.
 * - `{ retryAfterMs }`: try again no sooner than this (a server cooldown).
 *   Network signals don't jump the queue while it lasts.
 */
export type ReconnectAttemptResult =
  'connected' | 'stop' | 'retry' | { retryAfterMs: number };

export interface ReconnectSchedulerOptions {
  /** Runs one attempt. Never called while another is still in flight. */
  attempt: () => Promise<ReconnectAttemptResult>;
  /** First backoff step. */
  baseDelayMs?: number;
  /** Backoff cap. */
  maxDelayMs?: number;
  /**
   * Minimum time between attempts started by tab-visible / window-focus.
   * Switching tabs back and forth must not turn into a connect per click.
   */
  minTriggerIntervalMs?: number;
  /** Diagnostic hook. */
  log?: (message: string) => void;
}

const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_MIN_TRIGGER_INTERVAL_MS = 5_000;

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Retries a connection that could not be made at all, typically because the
 * app started offline.
 *
 * A connection that was up once has y-websocket's own reconnect loop and the
 * owners' online/visibility handlers. A connection whose first handshake
 * failed has neither, so this fills the gap until one attempt succeeds:
 *
 * - backoff doubles from `baseDelayMs` to `maxDelayMs`, with equal jitter
 *   (half fixed, half random) so many tabs never retry in lockstep and a
 *   delay never collapses to zero;
 * - while the browser reports offline, nothing is attempted; the `online`
 *   event starts an attempt straight away and resets the backoff;
 * - tab-visible and window-focus start an attempt too, at most once per
 *   `minTriggerIntervalMs`;
 * - one attempt at a time, so a trigger during an attempt is ignored.
 */
export class ReconnectScheduler {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly minTriggerIntervalMs: number;

  private active = false;
  private inFlight = false;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAttemptAt = 0;
  private cooldownUntil = 0;

  private readonly onOnline = (): void => {
    this.failures = 0;
    this.runNow('online', true);
  };
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.runNow('tab visible', false);
    }
  };
  private readonly onFocus = (): void => {
    this.runNow('window focus', false);
  };

  constructor(private readonly options: ReconnectSchedulerOptions) {
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.minTriggerIntervalMs =
      options.minTriggerIntervalMs ?? DEFAULT_MIN_TRIGGER_INTERVAL_MS;
  }

  /** True between {@link start} and the attempt that ends it (or {@link stop}). */
  get isActive(): boolean {
    return this.active;
  }

  /** True while an attempt is running. */
  get isAttemptInFlight(): boolean {
    return this.inFlight;
  }

  /**
   * Start retrying. The first attempt waits one backoff step: the caller has
   * just failed, so trying again at once would only fail again. Idempotent.
   */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.failures = 0;
    globalThis.addEventListener('online', this.onOnline);
    globalThis.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.scheduleNext();
  }

  /**
   * Attempt now (the user pressed Retry). Ignored while an attempt is
   * running or a server cooldown lasts.
   */
  retryNow(reason = 'requested'): void {
    this.failures = 0;
    this.runNow(reason, true);
  }

  /** Stop retrying and remove every listener. A running attempt finishes, but its result is ignored. */
  stop(): void {
    this.active = false;
    this.clearTimer();
    globalThis.removeEventListener('online', this.onOnline);
    globalThis.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private runNow(reason: string, ignoreThrottle: boolean): void {
    if (!this.active || this.inFlight || browserOffline()) return;
    const now = Date.now();
    if (now < this.cooldownUntil) return;
    if (!ignoreThrottle && now - this.lastAttemptAt < this.minTriggerIntervalMs)
      return;
    this.clearTimer();
    this.options.log?.(`Reconnecting now (${reason})`);
    void this.runAttempt();
  }

  private scheduleNext(retryAfterMs?: number): void {
    if (!this.active) return;
    this.clearTimer();
    let delay: number;
    if (retryAfterMs === undefined) {
      const step = Math.min(
        this.baseDelayMs * 2 ** this.failures,
        this.maxDelayMs
      );
      delay = step / 2 + withJitter(step / 2);
    } else {
      delay = retryAfterMs;
      this.cooldownUntil = Date.now() + retryAfterMs;
    }
    this.options.log?.(`Next reconnect attempt in ${Math.round(delay)}ms`);
    this.timer = setTimeout(() => {
      this.timer = null;
      // Offline: wait for the 'online' event rather than polling.
      if (browserOffline()) return;
      void this.runAttempt();
    }, delay);
  }

  private async runAttempt(): Promise<void> {
    if (!this.active || this.inFlight) return;
    this.inFlight = true;
    this.lastAttemptAt = Date.now();
    let result: ReconnectAttemptResult;
    try {
      result = await this.options.attempt();
    } catch {
      result = 'retry';
    } finally {
      this.inFlight = false;
    }
    if (!this.active) return;

    if (result === 'connected' || result === 'stop') {
      this.stop();
      return;
    }
    this.failures++;
    this.scheduleNext(result === 'retry' ? undefined : result.retryAfterMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/** Prefix of the rejection `createAuthenticatedWebsocketProvider` raises on a denial. */
const AUTH_DENIED_PREFIX = 'WebSocket authentication denied: ';

/**
 * The `access-denied` reason behind a failed first handshake, or null when
 * the socket never got that far (offline, server unreachable).
 */
export function initialConnectDenialReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const at = message.indexOf(AUTH_DENIED_PREFIX);
  if (at === -1) return null;
  return message.slice(at + AUTH_DENIED_PREFIX.length).trim() || 'unknown';
}

/**
 * How to follow up a failed first handshake: a hard denial stops, a throttle
 * or server-side failure waits out the long backoff, anything else (the
 * network) retries on the normal backoff.
 */
export function retryAfterInitialConnectFailure(
  error: unknown
): ReconnectAttemptResult {
  const reason = initialConnectDenialReason(error);
  if (reason === null) return 'retry';
  if (HARD_DENIAL_REASONS.has(reason)) return 'stop';
  if (LONG_BACKOFF_DENIAL_REASONS.has(reason)) {
    return { retryAfterMs: rateLimitBackoff() };
  }
  return 'retry';
}
