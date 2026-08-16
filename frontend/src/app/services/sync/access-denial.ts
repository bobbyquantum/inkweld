/**
 * Shared helpers for reacting to a server `access-denied` frame on a Yjs
 * WebSocket. Both the per-document sync path (DocumentService) and the
 * elements sync path (YjsElementSyncProvider) interpret the same wire
 * reasons the same way, so the parsing, the set of terminal reasons, and the
 * rate-limit backoff live here once instead of being duplicated (which Sonar
 * flags as duplicated code and which drifts out of sync).
 */

/**
 * One-shot backoff applied after the server rate-limits a reconnect. Exceeds
 * the server's reconnect cooldown (5s) so the retry doesn't land inside the
 * cooldown window and fail again — which previously produced a tight fail-loop
 * that read as instant `rate-limited` spam.
 */
export const RATE_LIMIT_BACKOFF_MS = 30_000;

/**
 * Server `access-denied:<reason>` codes that will not self-heal on retry (bad
 * token, no access, or a missing project/document). Retrying just burns
 * requests, so these stop the reconnect loop permanently until the user
 * refreshes / reopens.
 *
 * `error` is deliberately NOT here: the server sends it for a *server-side*
 * failure (e.g. the Durable Object failed to load the document), which says
 * nothing about this client's access and routinely self-heals — treating it
 * as terminal permanently benched healthy clients during transient backend
 * incidents. It gets the long backoff instead (see
 * {@link LONG_BACKOFF_DENIAL_REASONS}).
 */
export const HARD_DENIAL_REASONS: ReadonlySet<string> = new Set([
  'invalid-token',
  'forbidden',
  'project-not-found',
  'invalid-document',
]);

/**
 * Denial codes that are transient but mean the server needs breathing room:
 * a reconnect throttle (`rate-limited`) or a server-side failure (`error`).
 * Both paths stop y-websocket's internal auto-reconnect loop (which would
 * hammer the server on its fast schedule) and retry once per long, floored,
 * jittered backoff via {@link rateLimitBackoff}.
 */
export const LONG_BACKOFF_DENIAL_REASONS: ReadonlySet<string> = new Set([
  'rate-limited',
  'error',
]);

/**
 * Wire prefixes that mark a message as an access denial. The trailing `:` is
 * required so unrelated text such as `access-denieding` is not misread as a
 * denial (downstream handlers treat any non-null result as terminal/
 * rate-limited).
 */
const DENIAL_PREFIXES = ['access-denied:', 'Access denied:'] as const;

/**
 * Extract the `access-denied` reason from a server message, or null if the
 * message is not a denial. Handles both the raw wire frame
 * (`access-denied:error`) and the wrapped re-auth callback string
 * (`Access denied: error`). A denial with no reason after the delimiter
 * resolves to `'unknown'`.
 */
export function parseAccessDeniedReason(message: string): string | null {
  for (const prefix of DENIAL_PREFIXES) {
    if (message.startsWith(prefix)) {
      return message.slice(prefix.length).trim() || 'unknown';
    }
  }
  return null;
}

/**
 * Full-jitter backoff: return a uniform random integer in `[0, delayMs)`.
 * Spreading retries across the whole window (rather than only its upper half)
 * minimises the chance that concurrent clients/tabs retry in lockstep and
 * re-form a thundering herd on the single-threaded Durable Object. Uses
 * `crypto.getRandomValues` rather than `Math.random` so the jitter source is
 * not flagged as an insecure PRNG.
 *
 * NOTE: full jitter can produce very small values, so callers that must stay
 * above a hard floor (e.g. the server rate-limit cooldown) should use
 * {@link rateLimitBackoff} instead of wrapping this directly.
 */
export function withJitter(delayMs: number): number {
  const sample = new Uint32Array(1);
  crypto.getRandomValues(sample);
  return Math.floor((sample[0] / 2 ** 32) * delayMs);
}

/**
 * Jittered backoff for the rate-limit retry. Unlike {@link withJitter}, this
 * keeps a floor of `RATE_LIMIT_BACKOFF_MS / 2` so the sampled delay always
 * exceeds the server's reconnect cooldown (5s) — full jitter on its own could
 * land inside that window and reintroduce the tight fail-loop this whole
 * mechanism exists to prevent. The result lies in
 * `[RATE_LIMIT_BACKOFF_MS / 2, RATE_LIMIT_BACKOFF_MS)`.
 */
export function rateLimitBackoff(): number {
  const half = RATE_LIMIT_BACKOFF_MS / 2;
  return half + withJitter(half);
}
