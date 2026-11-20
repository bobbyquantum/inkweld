/**
 * Periodic re-check of authenticated collaboration sockets on the Durable
 * Object (Workers). Sessions are checked once when a socket authenticates;
 * without a re-check an expired token, a password reset, an admin disable
 * or an account deletion left an open socket reading and writing until it
 * disconnected (hibernation keeps it alive indefinitely).
 *
 * Kept in `src/utils` so it is unit-testable in Bun; the Durable Object
 * class itself can't be imported there (see utils/project-access.ts).
 */

import type { ProjectAccessResult, SessionClaims } from './project-access';

/** What a socket's attachment records about the session that opened it. */
export interface SocketSessionState {
  userId: string;
  username?: string;
  /** Issued-at (unix seconds) of the token the socket authenticated with. */
  iat?: number;
  /** Expiry (unix seconds) of that token. */
  exp?: number;
  canWrite: boolean;
}

/**
 * `keep`: still valid. `expired`: the token expired. `forbidden`: the
 * account or its access is gone. `access-changed`: still allowed, but the
 * write permission differs from the one the socket was opened with.
 */
export type SocketRecheckOutcome = 'keep' | 'expired' | 'forbidden' | 'access-changed';

/**
 * Decide what to do with each socket. The access check runs once per
 * distinct session (user and issue time), however many documents that
 * session has open. A check that throws keeps the socket: a database hiccup
 * must not disconnect everyone, and the next re-check tries again.
 */
export async function recheckSocketSessions<K>(
  sockets: ReadonlyArray<{ key: K; session: SocketSessionState }>,
  nowSeconds: number,
  checkAccess: (claims: SessionClaims) => Promise<ProjectAccessResult>
): Promise<Map<K, SocketRecheckOutcome>> {
  const outcomes = new Map<K, SocketRecheckOutcome>();
  const checks = new Map<string, Promise<ProjectAccessResult | null>>();

  const resolved = await Promise.all(
    sockets.map(async ({ key, session }) => {
      if (session.exp !== undefined && session.exp < nowSeconds) {
        return { key, outcome: 'expired' as const };
      }
      const groupKey = `${session.userId}\u0000${session.iat ?? ''}`;
      let check = checks.get(groupKey);
      if (!check) {
        check = checkAccess({
          userId: session.userId,
          username: session.username ?? '',
          iat: session.iat,
        }).catch(() => null);
        checks.set(groupKey, check);
      }
      const result = await check;
      if (!result) return { key, outcome: 'keep' as const };
      if (!result.ok) return { key, outcome: 'forbidden' as const };
      if (result.access.canWrite !== session.canWrite) {
        return { key, outcome: 'access-changed' as const };
      }
      return { key, outcome: 'keep' as const };
    })
  );
  for (const { key, outcome } of resolved) outcomes.set(key, outcome);
  return outcomes;
}
