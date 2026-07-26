/**
 * Per-document WebSocket reconnection rate limiter.
 *
 * Server-side immunity against reconnect storms: caps WS upgrades per
 * documentId so a single old/buggy/malicious client can't DoS the Durable
 * Object with rapid reconnect cycles (each cycle re-loads the full document
 * from storage + re-runs auth DB queries). Extracted as a pure helper so the
 * logic is unit-testable without a DO runtime.
 */

/** Default cooldown between WS upgrades for the same documentId. */
export const WS_RECONNECT_COOLDOWN_MS = 3_000;

/**
 * Given a map of last-accept timestamps and the current time, decide whether
 * a new WS upgrade for `documentId` should be allowed. Returns `{ allowed:
 * true }` or `{ allowed: false, retryAfterMs }`. Mutates the map on allow.
 */
export function checkWsRateLimit(
  lastAcceptMs: Map<string, number>,
  documentId: string,
  now: number,
  cooldownMs = WS_RECONNECT_COOLDOWN_MS
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const last = lastAcceptMs.get(documentId);
  if (last !== undefined && now - last < cooldownMs) {
    return { allowed: false, retryAfterMs: cooldownMs - (now - last) };
  }
  lastAcceptMs.set(documentId, now);
  return { allowed: true };
}
