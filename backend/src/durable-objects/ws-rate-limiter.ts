/**
 * Per-document WebSocket reconnection rate limiter.
 *
 * Server-side immunity against reconnect storms: caps WS upgrades per
 * documentId so a single old/buggy/malicious client can't DoS the Durable
 * Object with rapid reconnect cycles (each cycle re-loads the full document
 * from storage + re-runs auth DB queries). Extracted as a pure helper so the
 * logic is unit-testable without a DO runtime.
 *
 * Design: a sliding-window counter per documentId. The first
 * `MAX_RAPID_RECONNECTS` upgrades within `WINDOW_MS` are allowed (so
 * legitimate multi-tab access and page navigations aren't blocked). Once the
 * threshold is exceeded, subsequent upgrades are rejected with 429 until the
 * window elapses without a new attempt.
 */

/** Sliding window size (ms). */
const WINDOW_MS = 10_000;
/** Max reconnects allowed within the window before throttling kicks in. */
const MAX_RAPID_RECONNECTS = 3;
/** Cooldown applied after the threshold is exceeded (ms). */
const COOLDOWN_MS = 5_000;

/**
 * Given a map of per-doc reconnect timestamps and the current time, decide
 * whether a new WS upgrade for `documentId` should be allowed. Mutates the
 * map on allow. Returns `{ allowed: true }` or `{ allowed: false,
 * retryAfterMs }`.
 */
export function checkWsRateLimit(
  reconnectHistory: Map<string, number[]>,
  documentId: string,
  now: number,
  windowMs = WINDOW_MS,
  maxRapidReconnects = MAX_RAPID_RECONNECTS,
  cooldownMs = COOLDOWN_MS
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const history = reconnectHistory.get(documentId) ?? [];

  // Drop timestamps outside the window.
  const recent = history.filter((t) => now - t < windowMs);

  if (recent.length >= maxRapidReconnects) {
    // Check if we're still in the cooldown after the threshold was hit.
    const lastAttempt = recent[recent.length - 1] ?? 0;
    if (now - lastAttempt < cooldownMs) {
      return { allowed: false, retryAfterMs: cooldownMs - (now - lastAttempt) };
    }
  }

  // Allow and record.
  recent.push(now);
  reconnectHistory.set(documentId, recent);
  return { allowed: true };
}
