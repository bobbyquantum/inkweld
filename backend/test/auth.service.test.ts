import { describe, it, expect } from 'bun:test';
import { sign } from 'hono/jwt';
import { authService } from '../src/services/auth.service';
import type { Context } from 'hono';

const DEV_SECRET = 'fallback-secret-for-development-only';

function mockContext(overrides?: {
  env?: Record<string, string>;
  authHeader?: string | null;
  get?: Record<string, unknown>;
}): Context {
  const store: Record<string, unknown> = { ...(overrides?.get ?? {}) };
  return {
    env: overrides?.env ?? {},
    req: {
      header: () => overrides?.authHeader ?? null,
    },
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => {
      store[key] = value;
    },
    json: (_body: unknown, _status?: number) =>
      new Response(JSON.stringify(_body), { status: _status ?? 200 }),
  } as unknown as Context;
}

describe('AuthService – getSecret', () => {
  it('returns DATABASE_KEY from env when >= 32 chars', () => {
    const key = 'd'.repeat(32);
    const c = mockContext({ env: { DATABASE_KEY: key } });
    expect((authService as any).getSecret(c)).toBe(key);
  });

  it('returns SESSION_SECRET from env when DATABASE_KEY absent and secret >= 32 chars', () => {
    const key = 's'.repeat(32);
    const c = mockContext({ env: { SESSION_SECRET: key } });
    expect((authService as any).getSecret(c)).toBe(key);
  });

  it('prefers DATABASE_KEY over SESSION_SECRET when both are present', () => {
    const dk = 'd'.repeat(32);
    const c = mockContext({ env: { DATABASE_KEY: dk, SESSION_SECRET: 's'.repeat(32) } });
    expect((authService as any).getSecret(c)).toBe(dk);
  });

  it('falls back to config secret when env key is too short', () => {
    const c = mockContext({ env: { DATABASE_KEY: 'short' } });
    expect((authService as any).getSecret(c)).toBe(DEV_SECRET);
  });

  it('falls back to config secret when no env present', () => {
    const c = mockContext({ env: {} });
    expect((authService as any).getSecret(c)).toBe(DEV_SECRET);
  });

  it('falls back to config secret when env is empty object', () => {
    const c = mockContext();
    expect((authService as any).getSecret(c)).toBe(DEV_SECRET);
  });
});

describe('AuthService – createSession', () => {
  it('creates a valid JWT token for a user', async () => {
    const user = { id: 'user-1', username: 'alice', email: 'alice@test.com' } as any;
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });

    const token = await authService.createSession(c, user);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
  });

  it('creates an enrolment session with short expiry', async () => {
    const user = { id: 'user-2', username: 'bob', email: 'bob@test.com' } as any;
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });

    const token = await authService.createEnrolmentSession(c, user);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });
});

describe('AuthService – getSession', () => {
  it('returns null when no Authorization header present', async () => {
    const c = mockContext({ authHeader: null });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns null when Authorization header is not Bearer', async () => {
    const c = mockContext({ authHeader: 'Basic xyz' });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns null when Bearer token is empty', async () => {
    const c = mockContext({ authHeader: 'Bearer ' });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns null for an invalid token', async () => {
    const c = mockContext({
      authHeader: 'Bearer invalid.jwt.here',
      env: { DATABASE_KEY: DEV_SECRET },
    });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns valid session data for a well-formed token', async () => {
    const payload = {
      userId: 'u1',
      username: 'alice',
      email: '',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });

    const session = await authService.getSession(c);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('u1');
    expect(session?.username).toBe('alice');
  });

  it('returns null when payload is missing userId', async () => {
    const token = await sign(
      { username: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 },
      DEV_SECRET,
      'HS256'
    );
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns null when payload is missing username', async () => {
    const token = await sign(
      { userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 },
      DEV_SECRET,
      'HS256'
    );
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.getSession(c)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const payload = { userId: 'u1', username: 'alice', exp: Math.floor(Date.now() / 1000) - 60 };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.getSession(c)).toBeNull();
  });
});

describe('AuthService – getSessionWithReason', () => {
  it('returns no-auth when no header', async () => {
    const c = mockContext({ authHeader: null });
    const result = await authService.getSessionWithReason(c);
    expect(result.status).toBe('no-auth');
  });

  it('returns no-auth when header is not Bearer', async () => {
    const c = mockContext({ authHeader: 'Basic x' });
    expect((await authService.getSessionWithReason(c)).status).toBe('no-auth');
  });

  it('returns no-auth when Bearer token is empty', async () => {
    const c = mockContext({ authHeader: 'Bearer ' });
    expect((await authService.getSessionWithReason(c)).status).toBe('no-auth');
  });

  it('returns invalid-token for malformed JWT', async () => {
    const c = mockContext({ authHeader: 'Bearer garbage', env: { DATABASE_KEY: DEV_SECRET } });
    expect((await authService.getSessionWithReason(c)).status).toBe('invalid-token');
  });

  it('returns invalid-token when payload is expired (hono verify throws before manual check)', async () => {
    const payload = { userId: 'u1', username: 'alice', exp: Math.floor(Date.now() / 1000) - 60 };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });
    const result = await authService.getSessionWithReason(c);
    expect(result.status).toBe('invalid-token');
  });

  it('returns valid for a good token', async () => {
    const payload = { userId: 'u1', username: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ authHeader: `Bearer ${token}`, env: { DATABASE_KEY: DEV_SECRET } });
    const result = await authService.getSessionWithReason(c);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.session.userId).toBe('u1');
    }
  });
});

describe('AuthService – verifyToken', () => {
  it('returns null for empty token', async () => {
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.verifyToken('', c)).toBeNull();
  });

  it('returns null for malformed token', async () => {
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.verifyToken('bad.token', c)).toBeNull();
  });

  it('returns session data for a valid token', async () => {
    const payload = {
      userId: 'u1',
      username: 'bob',
      email: '',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });

    const session = await authService.verifyToken(token, c);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('u1');
    expect(session?.username).toBe('bob');
  });

  it('returns null for expired token', async () => {
    const payload = { userId: 'u1', username: 'bob', exp: Math.floor(Date.now() / 1000) - 60 };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.verifyToken(token, c)).toBeNull();
  });

  it('returns null for token missing required fields', async () => {
    const payload = { userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = await sign(payload, DEV_SECRET, 'HS256');
    const c = mockContext({ env: { DATABASE_KEY: DEV_SECRET } });
    expect(await authService.verifyToken(token, c)).toBeNull();
  });
});

describe('AuthService – authenticate', () => {
  it('returns null when username not found', async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    } as any;
    expect(await authService.authenticate(db, 'nobody', 'pwd')).toBeNull();
  });
});

describe('AuthService – destroySession', () => {
  it('is a no-op (JWT-based)', () => {
    const c = mockContext();
    expect(() => authService.destroySession(c)).not.toThrow();
  });
});
