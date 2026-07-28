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
 * token, no access, missing project, or a server-side load failure such as a
 * document that can't be loaded). Retrying just burns requests, so these stop
 * the reconnect loop permanently until the user refreshes / reopens.
 */
export const HARD_DENIAL_REASONS: ReadonlySet<string> = new Set([
  'invalid-token',
  'forbidden',
  'project-not-found',
  'invalid-document',
  'error',
]);

/**
 * Extract the `access-denied` reason from a server message, or null if the
 * message is not a denial. Handles both the raw wire frame
 * (`access-denied:error`) and the wrapped re-auth callback string
 * (`Access denied: error`).
 */
export function parseAccessDeniedReason(message: string): string | null {
  let raw: string | null = null;
  if (message.startsWith('access-denied')) {
    raw = message.slice('access-denied'.length);
  } else if (message.startsWith('Access denied')) {
    raw = message.slice('Access denied'.length);
  }
  if (raw === null) return null;
  return raw.replace(/^[:\s]+/, '').trim() || 'unknown';
}

/**
 * Full-jitter backoff: scale `delayMs` by a factor in [0.5, 1) so concurrent
 * clients/tabs don't retry in lockstep (thundering herd on the single-threaded
 * Durable Object). Uses crypto.getRandomValues rather than Math.random so the
 * jitter source isn't flagged as an insecure PRNG.
 */
export function withJitter(delayMs: number): number {
  const sample = new Uint32Array(1);
  crypto.getRandomValues(sample);
  const factor = 0.5 + (sample[0] / 0x1_0000_0000) * 0.5;
  return Math.floor(delayMs * factor);
}
