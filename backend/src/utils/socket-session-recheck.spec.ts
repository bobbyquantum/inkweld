import { describe, expect, it } from 'bun:test';
import type { ProjectAccessResult, SessionClaims } from './project-access';
import { recheckSocketSessions, type SocketSessionState } from './socket-session-recheck';

const NOW = 1_800_000_000;

function allow(canWrite: boolean): ProjectAccessResult {
  return { ok: true, access: { canWrite, projectDbId: 'p', role: null } };
}

describe('recheckSocketSessions', () => {
  it('closes expired tokens without asking the database', async () => {
    const calls: SessionClaims[] = [];
    const outcomes = await recheckSocketSessions(
      [{ key: 'a', session: { userId: 'u', canWrite: true, exp: NOW - 1 } }],
      NOW,
      (claims) => {
        calls.push(claims);
        return Promise.resolve(allow(true));
      }
    );
    expect(outcomes.get('a')).toBe('expired');
    expect(calls).toEqual([]);
  });

  it('refuses sessions the access check denies and flags changed write access', async () => {
    const sockets: Array<{ key: string; session: SocketSessionState }> = [
      { key: 'revoked', session: { userId: 'gone', iat: 1, canWrite: true, exp: NOW + 60 } },
      { key: 'downgraded', session: { userId: 'ed', iat: 2, canWrite: true } },
      { key: 'fine', session: { userId: 'ok', iat: 3, canWrite: false } },
    ];
    const outcomes = await recheckSocketSessions(sockets, NOW, (claims) =>
      Promise.resolve(claims.userId === 'gone' ? { ok: false, reason: 'forbidden' } : allow(false))
    );
    expect(Object.fromEntries(outcomes)).toEqual({
      revoked: 'forbidden',
      downgraded: 'access-changed',
      fine: 'keep',
    });
  });

  it('checks each session once and passes its issue time on', async () => {
    const calls: SessionClaims[] = [];
    await recheckSocketSessions(
      [
        { key: 1, session: { userId: 'u', username: 'una', iat: 10, canWrite: true } },
        { key: 2, session: { userId: 'u', username: 'una', iat: 10, canWrite: true } },
        { key: 3, session: { userId: 'u', username: 'una', iat: 11, canWrite: true } },
      ],
      NOW,
      (claims) => {
        calls.push(claims);
        return Promise.resolve(allow(true));
      }
    );
    expect(calls).toEqual([
      { userId: 'u', username: 'una', iat: 10 },
      { userId: 'u', username: 'una', iat: 11 },
    ]);
  });

  it('keeps sockets when the check itself fails', async () => {
    const outcomes = await recheckSocketSessions(
      [{ key: 'a', session: { userId: 'u', canWrite: true } }],
      NOW,
      () => Promise.reject(new Error('D1 unavailable'))
    );
    expect(outcomes.get('a')).toBe('keep');
  });
});
