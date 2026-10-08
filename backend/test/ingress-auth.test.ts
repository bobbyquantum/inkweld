/**
 * Home Assistant ingress sign-in (POST /api/v1/auth/ingress).
 *
 * The test server listens on 127.0.0.1, so INGRESS_TRUSTED_PROXY points there
 * to stand in for the Supervisor's ingress proxy.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { ingressAuthService } from '../src/services/ingress-auth.service';
import { userService } from '../src/services/user.service';
import { startTestServer, stopTestServer } from './server-test-helper';

const saved = {
  enabled: process.env['INGRESS_ENABLED'],
  proxy: process.env['INGRESS_TRUSTED_PROXY'],
  admins: process.env['INGRESS_ADMINS'],
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

// Unique per run: the in-memory database is shared with every other suite.
const run = crypto.randomUUID().slice(0, 8);
const haId = (name: string) => `ha-${run}-${name}`;

describe('POST /api/v1/auth/ingress', () => {
  let baseUrl: string;

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
  });

  afterEach(() => {
    process.env['INGRESS_ENABLED'] = 'true';
    process.env['INGRESS_TRUSTED_PROXY'] = '127.0.0.1';
    delete process.env['INGRESS_ADMINS'];
  });

  afterAll(async () => {
    restore('INGRESS_ENABLED', saved.enabled);
    restore('INGRESS_TRUSTED_PROXY', saved.proxy);
    restore('INGRESS_ADMINS', saved.admins);
    await stopTestServer();
  });

  beforeAll(() => {
    process.env['INGRESS_ENABLED'] = 'true';
    process.env['INGRESS_TRUSTED_PROXY'] = '127.0.0.1';
    delete process.env['INGRESS_ADMINS'];
  });

  function signIn(headers: Record<string, string>) {
    return fetch(`${baseUrl}/api/v1/auth/ingress`, { method: 'POST', headers });
  }

  type SignInBody = {
    token: string;
    user: { id: string; username: string; name: string; isAdmin: boolean };
  };

  it('creates an approved account and returns a working session token', async () => {
    const response = await signIn({
      'X-Remote-User-Id': haId('carol'),
      'X-Remote-User-Name': `carol${run}`,
      'X-Remote-User-Display-Name': 'Carol',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as SignInBody;
    expect(body.user.username).toBe(`carol${run}`);
    expect(body.user.name).toBe('Carol');

    const me = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { username: string }).username).toBe(`carol${run}`);
  });

  it('signs the same HA user into the same account after a rename', async () => {
    const first = (await (
      await signIn({ 'X-Remote-User-Id': haId('dave'), 'X-Remote-User-Name': `dave${run}` })
    ).json()) as SignInBody;
    const second = (await (
      await signIn({ 'X-Remote-User-Id': haId('dave'), 'X-Remote-User-Name': `david${run}` })
    ).json()) as SignInBody;
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.username).toBe(`dave${run}`);
  });

  it('gives a colliding username a numeric suffix', async () => {
    await signIn({ 'X-Remote-User-Id': haId('eve-1'), 'X-Remote-User-Name': `eve${run}` });
    const response = await signIn({
      'X-Remote-User-Id': haId('eve-2'),
      'X-Remote-User-Name': `eve${run}`,
    });
    expect(((await response.json()) as SignInBody).user.username).toBe(`eve${run}-2`);
  });

  it('refuses a disabled account', async () => {
    const created = (await (
      await signIn({ 'X-Remote-User-Id': haId('frank'), 'X-Remote-User-Name': `frank${run}` })
    ).json()) as SignInBody;
    await userService.setUserEnabled(getDatabase(), created.user.id, false);

    const response = await signIn({
      'X-Remote-User-Id': haId('frank'),
      'X-Remote-User-Name': `frank${run}`,
    });
    expect(response.status).toBe(403);
  });

  it('grants and revokes admin from INGRESS_ADMINS', async () => {
    // Another active admin, so revoking grace's rights is allowed.
    const other = await userService.create(
      getDatabase(),
      { username: `other-admin-${run}` },
      { autoApprove: true }
    );
    await userService.setUserAdmin(getDatabase(), other.id, true);

    process.env['INGRESS_ADMINS'] = `someone-else, GRACE${run}`;
    const granted = (await (
      await signIn({ 'X-Remote-User-Id': haId('grace'), 'X-Remote-User-Name': `grace${run}` })
    ).json()) as SignInBody;
    expect(granted.user.isAdmin).toBe(true);

    process.env['INGRESS_ADMINS'] = 'someone-else';
    const revoked = (await (
      await signIn({ 'X-Remote-User-Id': haId('grace'), 'X-Remote-User-Name': `grace${run}` })
    ).json()) as SignInBody;
    expect(revoked.user.isAdmin).toBe(false);
  });

  it('keeps admin rights on the last active admin', async () => {
    process.env['INGRESS_ADMINS'] = `heidi${run}`;
    const created = (await (
      await signIn({ 'X-Remote-User-Id': haId('heidi'), 'X-Remote-User-Name': `heidi${run}` })
    ).json()) as SignInBody;
    expect(created.user.isAdmin).toBe(true);

    const revoke = spyOn(userService, 'revokeAdminUnlessLast').mockResolvedValue(false);
    try {
      process.env['INGRESS_ADMINS'] = 'someone-else';
      const kept = (await (
        await signIn({ 'X-Remote-User-Id': haId('heidi'), 'X-Remote-User-Name': `heidi${run}` })
      ).json()) as SignInBody;
      expect(kept.user.isAdmin).toBe(true);
    } finally {
      revoke.mockRestore();
    }
  });

  it('does not grant admin without a list unless it is the first account', async () => {
    const response = await signIn({
      'X-Remote-User-Id': haId('ivan'),
      'X-Remote-User-Name': `ivan${run}`,
    });
    expect(((await response.json()) as SignInBody).user.isAdmin).toBe(false);
  });

  it('returns 404 when ingress is disabled', async () => {
    delete process.env['INGRESS_ENABLED'];
    const response = await signIn({ 'X-Remote-User-Id': haId('judy') });
    expect(response.status).toBe(404);
  });

  it('returns 404 for a peer other than the ingress proxy', async () => {
    process.env['INGRESS_TRUSTED_PROXY'] = '172.30.32.2';
    const response = await signIn({ 'X-Remote-User-Id': haId('judy') });
    expect(response.status).toBe(404);
  });

  it('returns 404 without a user id header', async () => {
    const response = await signIn({ 'X-Remote-User-Name': 'nobody' });
    expect(response.status).toBe(404);
  });
});

describe('ingressAuthService.signIn', () => {
  const db = () => getDatabase();

  afterEach(() => {
    delete process.env['INGRESS_ADMINS'];
  });

  it('makes the first account on an empty instance an admin', async () => {
    const count = spyOn(userService, 'countUsers').mockResolvedValue(1);
    try {
      const result = await ingressAuthService.signIn(db(), {
        id: haId('first'),
        username: `first${run}`,
        displayName: null,
      });
      expect(result.ok && result.user.isAdmin).toBe(true);
    } finally {
      count.mockRestore();
    }
  });

  it('refuses an account that is pending approval', async () => {
    const created = await ingressAuthService.signIn(db(), {
      id: haId('pending'),
      username: `pending${run}`,
      displayName: null,
    });
    if (!created.ok) throw new Error('expected an account');
    await db().update(users).set({ approved: false }).where(eq(users.id, created.user.id));

    const result = await ingressAuthService.signIn(db(), {
      id: haId('pending'),
      username: `pending${run}`,
      displayName: null,
    });
    expect(result).toEqual({ ok: false, status: 403, error: 'Account pending approval' });
  });

  it('picks up the account created by a concurrent first sign-in', async () => {
    const haUser = { id: haId('race'), username: `race${run}`, displayName: null };
    const [a, b] = await Promise.all([
      ingressAuthService.signIn(db(), haUser),
      ingressAuthService.signIn(db(), haUser),
    ]);
    expect(a.ok && b.ok && a.user.id === b.user.id).toBe(true);
  });
});
