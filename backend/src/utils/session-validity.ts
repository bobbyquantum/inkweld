/**
 * Session-token revocation check shared by the HTTP auth middleware
 * (auth.service.getUserFromSession), the Bun WebSocket auth path
 * (routes/yjs.routes.ts), the Durable Object (via utils/project-access) and
 * MCP OAuth sessions (services/mcp-oauth.service).
 *
 * Sessions are stateless JWTs, so revocation is a per-user watermark:
 * `users.sessionsValidFrom` (unix seconds) is bumped whenever every existing
 * session must die — password reset, passkey recovery, admin disable or
 * unapprove — and any token issued (`iat`) before that instant is rejected.
 *
 * A token with no `iat` predates this mechanism and is treated as issued at
 * 0, i.e. revoked as soon as the user has ever been bumped.
 */
export interface SessionValidityUser {
  sessionsValidFrom: number;
}

export interface SessionValidityClaims {
  iat?: number;
}

export function isSessionRevoked(
  user: SessionValidityUser,
  session: SessionValidityClaims
): boolean {
  if (!user.sessionsValidFrom) return false;
  return (session.iat ?? 0) < user.sessionsValidFrom;
}

/** The watermark value for "revoke everything issued before now". */
export function sessionWatermarkNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Listeners told when every session of a user has just been revoked, so live
 * connections that authenticated once (collaboration sockets) can be closed
 * at once instead of lasting until they reconnect. On Bun/Node the Yjs
 * service registers one; on Workers the sockets live in Durable Objects,
 * which re-check their sessions on an alarm instead (`SESSION_RECHECK_MS`).
 */
type SessionRevocationListener = (userId: string) => void;
const revocationListeners = new Set<SessionRevocationListener>();

/** Register a listener; returns a function that removes it again. */
export function onSessionsRevoked(listener: SessionRevocationListener): () => void {
  revocationListeners.add(listener);
  return () => revocationListeners.delete(listener);
}

/** Tell every listener that `userId`'s sessions were revoked. Never throws. */
export function notifySessionsRevoked(userId: string): void {
  for (const listener of revocationListeners) {
    try {
      listener(userId);
    } catch {
      // Best effort: the watermark is already stored, and a socket the
      // listener missed is still caught by the periodic re-check.
    }
  }
}

/**
 * How often an open collaboration socket re-checks its session (token
 * expiry, account enabled/approved, revocation watermark). Bounds how long a
 * socket outlives a revocation where it can't be closed straight away.
 */
export const SESSION_RECHECK_MS = 5 * 60 * 1000;
