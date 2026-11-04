import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Hono } from 'hono';
import { join } from 'node:path';
import * as schema from '../src/db/schema';
import githubAuthRoutes from '../src/routes/github-auth.routes';
import { configService } from '../src/services/config.service';
import { oauthLoginCodeService } from '../src/services/oauth-login-code.service';
import { userService } from '../src/services/user.service';
import type { AppContext } from '../src/types/context';
import type { GithubEmailEntry } from '../src/utils/github-emails';

/**
 * The GitHub callback runs against its own database, with GitHub's token and
 * user API answered in-process.
 */
describe('GitHub sign-in callback', () => {
  const SITE = 'https://app.example.test';
  let sqlite: Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: Hono<AppContext>;
  let fetchSpy: ReturnType<typeof spyOn> | undefined;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: join(import.meta.dir, '../drizzle') });
    await Promise.all([
      configService.set(db, 'GITHUB_ENABLED', 'true'),
      configService.set(db, 'GITHUB_CLIENT_ID', 'client-id'),
      configService.set(db, 'GITHUB_CLIENT_SECRET', 'client-secret'),
      configService.set(db, 'SITE_URL', SITE),
      configService.set(db, 'USER_APPROVAL_REQUIRED', 'false'),
    ]);
    // An instance that already has an administrator, so no sign-in here is
    // the first account.
    const admin = await userService.create(db, { username: 'admin-user' }, { autoApprove: true });
    await userService.setUserAdmin(db, admin.id, true);
    app = new Hono<AppContext>();
    app.use('*', async (c, next) => {
      c.set('db', db);
      await next();
    });
    app.route('/api/v1/auth', githubAuthRoutes);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    sqlite.close();
  });

  /** Answer GitHub's API as the account with this id, login and address list. */
  function signInToGithubAs(account: { id: number; login: string; emails: GithubEmailEntry[] }) {
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : String(input);
      switch (url) {
        case 'https://github.com/login/oauth/access_token':
          return Promise.resolve(
            Response.json({ access_token: 'gh-token', token_type: 'bearer', scope: 'user:email' })
          );
        case 'https://api.github.com/user':
          return Promise.resolve(Response.json({ id: account.id, login: account.login }));
        case 'https://api.github.com/user/emails':
          return Promise.resolve(Response.json(account.emails));
        default:
          return Promise.reject(new Error(`Unexpected request to ${url}`));
      }
    });
  }

  const verified = (email: string): GithubEmailEntry[] => [
    { email, primary: true, verified: true },
  ];

  async function callback(): Promise<URL> {
    const response = await app.request('/api/v1/auth/github?code=gh-code&state=gh-state', {
      headers: { Cookie: 'state=gh-state' },
    });
    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    return new URL(location ?? '');
  }

  /** The account a one-time login code in the redirect was issued for. */
  function loginCodeOwner(location: URL): Promise<string | null> {
    return oauthLoginCodeService.redeem(db, location.searchParams.get('code') ?? '', 'github');
  }

  it('does not attach GitHub to an existing account with the same verified email', async () => {
    const existing = await userService.create(
      db,
      { username: 'writer', email: 'writer@example.com' },
      { autoApprove: true }
    );
    signInToGithubAs({ id: 1001, login: 'writer-gh', emails: verified('writer@example.com') });

    const location = await callback();

    expect(location.href).toBe(`${SITE}/oauth/callback?error=email_in_use&provider=github`);
    expect((await userService.findById(db, existing.id))?.githubId).toBeNull();
    expect(await userService.findByGithubId(db, '1001')).toBeUndefined();
    expect(await userService.countUsers(db)).toBe(2);
    expect(await db.select().from(schema.oauthLoginCodes)).toHaveLength(0);
  });

  it('keeps refusing on a repeat attempt, with approval required too', async () => {
    // The refused attempt must not leave an account the next one signs in to.
    await configService.set(db, 'USER_APPROVAL_REQUIRED', 'true');
    await userService.create(db, { username: 'writer', email: 'writer@example.com' });
    signInToGithubAs({ id: 1001, login: 'writer-gh', emails: verified('writer@example.com') });

    expect((await callback()).searchParams.get('error')).toBe('email_in_use');
    expect((await callback()).searchParams.get('error')).toBe('email_in_use');
    expect(await userService.findByGithubId(db, '1001')).toBeUndefined();
  });

  it('signs in the account already linked to the GitHub id', async () => {
    const linked = await userService.create(
      db,
      { username: 'writer', email: 'writer@example.com' },
      { autoApprove: true }
    );
    await db.update(schema.users).set({ githubId: '1001' }).where(eq(schema.users.id, linked.id));
    signInToGithubAs({ id: 1001, login: 'writer-gh', emails: verified('writer@example.com') });

    const location = await callback();

    expect(location.pathname).toBe('/oauth/callback');
    expect(await loginCodeOwner(location)).toBe(linked.id);
    expect(await userService.countUsers(db)).toBe(2);
  });

  it('signs in the linked account when another account also uses its email', async () => {
    const local = await userService.create(
      db,
      { username: 'writer', email: 'writer@example.com' },
      { autoApprove: true }
    );
    const linked = await userService.create(
      db,
      { username: 'writer-gh', email: 'writer@example.com' },
      { autoApprove: true }
    );
    await db.update(schema.users).set({ githubId: '1001' }).where(eq(schema.users.id, linked.id));
    signInToGithubAs({ id: 1001, login: 'writer-gh', emails: verified('writer@example.com') });

    const location = await callback();

    expect(location.pathname).toBe('/oauth/callback');
    expect(await loginCodeOwner(location)).toBe(linked.id);
    expect((await userService.findById(db, local.id))?.githubId).toBeNull();
  });

  it('creates an account for a new GitHub identity whose verified email is unused', async () => {
    signInToGithubAs({ id: 2002, login: 'new-writer', emails: verified('new@example.com') });

    const location = await callback();

    const created = await userService.findByGithubId(db, '2002');
    if (!created) throw new Error('No account was created for the GitHub identity');
    expect(created).toMatchObject({
      username: 'new-writer',
      email: 'new@example.com',
      approved: true,
      isAdmin: false,
    });
    expect(location.pathname).toBe('/oauth/callback');
    expect(await loginCodeOwner(location)).toBe(created.id);
  });

  it('creates an account without an email when GitHub has no verified address', async () => {
    // The unconfirmed address matches an existing account; it is not compared.
    const existing = await userService.create(
      db,
      { username: 'writer', email: 'writer@example.com' },
      { autoApprove: true }
    );
    signInToGithubAs({
      id: 3003,
      login: 'other-writer',
      emails: [{ email: 'writer@example.com', primary: true, verified: false }],
    });

    const location = await callback();

    const created = await userService.findByGithubId(db, '3003');
    if (!created) throw new Error('No account was created for the GitHub identity');
    expect(created.id).not.toBe(existing.id);
    expect(created.email || null).toBeNull();
    expect(await loginCodeOwner(location)).toBe(created.id);
    expect((await userService.findById(db, existing.id))?.githubId).toBeNull();
  });

  it('sends a new account to the approval page when approval is required', async () => {
    await configService.set(db, 'USER_APPROVAL_REQUIRED', 'true');
    signInToGithubAs({
      id: 4004,
      login: 'pending-writer',
      emails: verified('pending@example.com'),
    });

    const location = await callback();

    expect(location.href).toBe(`${SITE}/approval-pending`);
    expect(await userService.findByGithubId(db, '4004')).toMatchObject({ approved: false });
    expect(await db.select().from(schema.oauthLoginCodes)).toHaveLength(0);
  });

  it('turns away a disabled account linked to the GitHub id', async () => {
    const linked = await userService.create(
      db,
      { username: 'writer', email: 'writer@example.com' },
      { autoApprove: true }
    );
    await db
      .update(schema.users)
      .set({ githubId: '5005', enabled: false })
      .where(eq(schema.users.id, linked.id));
    signInToGithubAs({ id: 5005, login: 'writer-gh', emails: verified('writer@example.com') });

    const location = await callback();

    expect(location.href).toBe(`${SITE}/?error=account_disabled`);
    expect(await db.select().from(schema.oauthLoginCodes)).toHaveLength(0);
  });

  it('reports any other failure as a generic sign-in error', async () => {
    const failure = spyOn(userService, 'createOrUpdateGithubUser').mockRejectedValue(
      new Error('database unavailable')
    );
    try {
      signInToGithubAs({ id: 6006, login: 'writer-gh', emails: verified('writer@example.com') });

      const location = await callback();

      expect(location.href).toBe(`${SITE}/?error=github_auth_failed`);
      expect(await db.select().from(schema.oauthLoginCodes)).toHaveLength(0);
    } finally {
      failure.mockRestore();
    }
  });
});
