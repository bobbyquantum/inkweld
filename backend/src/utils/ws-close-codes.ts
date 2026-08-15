/**
 * WebSocket close codes for the Yjs document sockets, following the
 * y-websocket 3.1 convention for the RFC 6455 private-use range (4000-4999):
 *
 * - 4400-4499: PERMANENT. The server made a deliberate decision that
 *   reconnecting cannot fix (bad token, no access, missing project/document).
 *   y-websocket's default `shouldReconnect` treats this band as terminal: the
 *   provider stops its internal reconnect loop and emits `closed`.
 * - 4500-4599: TRANSIENT. The matching "try again later" band (server-side
 *   failures, rate limiting). y-websocket keeps reconnecting with backoff.
 *
 * The trailing digits are an HTTP mnemonic only (4401 ~ 401, 4529 ~ 429); the
 * band is what carries the semantics.
 *
 * Every denial close is still preceded by an `access-denied:<reason>` TEXT
 * frame (the primary signal the frontend reacts to); the close code is the
 * backstop that also stops y-websocket's internal reconnect loop if the text
 * frame is ever lost. The frontend maps these codes back to denial reasons in
 * `frontend/src/app/services/sync/access-denial.ts` — keep the two in sync.
 */

/** Permanent: the JWT was missing/invalid/expired. Re-authenticating with a new token is required. */
export const WS_CLOSE_INVALID_TOKEN = 4401;
/** Permanent: the documentId is not parseable. Retrying with the same ID can never succeed. */
export const WS_CLOSE_INVALID_DOCUMENT = 4400;
/** Permanent: the project does not exist (deleted or never existed). */
export const WS_CLOSE_PROJECT_NOT_FOUND = 4404;
/** Permanent: the user has no access to this project. */
export const WS_CLOSE_FORBIDDEN = 4403;
/** Transient: a server-side failure (DO load error, storage error). Self-heals; retry later. */
export const WS_CLOSE_SERVER_ERROR = 4500;
/** Transient: reconnect rate limit hit. The client must honour the cooldown. */
export const WS_CLOSE_RATE_LIMITED = 4529;
