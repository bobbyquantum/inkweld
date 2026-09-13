/**
 * Session-token revocation check shared by the HTTP auth middleware
 * (auth.service.getUserFromSession), the Bun WebSocket auth path
 * (routes/yjs.routes.ts) and the Durable Object (via utils/project-access).
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
