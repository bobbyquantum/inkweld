/**
 * Limits for the pre-authentication window of a Yjs collaboration socket.
 *
 * y-websocket starts the sync handshake as soon as the socket opens, before
 * the server has seen the auth text frame, so binary frames legitimately
 * arrive early and are queued until auth completes. Without a bound, an
 * unauthenticated client could queue frames indefinitely and never send a
 * token at all: unbounded memory per socket, and (on Workers) a socket that
 * consumes no rate-limit budget because that is applied after auth.
 *
 * Shared by the Bun path (routes/yjs.routes.ts) and the Durable Object so the
 * two runtimes enforce identical budgets.
 */

/** Maximum queued frames before auth. A full initial sync is ~5-15 frames. */
export const MAX_PREAUTH_QUEUED_FRAMES = 64;
/** Maximum queued bytes before auth. */
export const MAX_PREAUTH_QUEUED_BYTES = 512 * 1024;
/** A socket that has not authenticated within this window is closed. */
export const PREAUTH_TIMEOUT_MS = 10_000;

/**
 * Whether one more frame of `frameBytes` fits in the pre-auth queue that
 * currently holds `queuedFrames` frames totalling `queuedBytes`.
 */
export function preAuthQueueAccepts(
  queuedFrames: number,
  queuedBytes: number,
  frameBytes: number
): boolean {
  if (queuedFrames >= MAX_PREAUTH_QUEUED_FRAMES) return false;
  return queuedBytes + frameBytes <= MAX_PREAUTH_QUEUED_BYTES;
}

/** Whether an unauthenticated socket accepted at `connectedAt` has run out of time at `now`. */
export function preAuthDeadlinePassed(connectedAt: number, now: number): boolean {
  return now - connectedAt >= PREAUTH_TIMEOUT_MS;
}
