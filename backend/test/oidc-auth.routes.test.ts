import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Hono } from 'hono';
import { join } from 'node:path';
import * as schema from '../src/db/schema';
import oidcAuthRoutes from '../src/routes/oidc-auth.routes';
import { adminConfigRoutes } from '../src/routes/admin-config.routes';
import { authService } from '../src/services/auth.service';
import { configService } from '../src/services/config.service';
import { oidcAuthService } from '../src/services/oidc-auth.service';
import { userService } from '../src/services/user.service';
import type { AppContext } from '../src/types/context';

describe('OIDC callbacks', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: Hono<AppContext>;
  const mocks: { mockRestore(): void }[] = [];

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: join(import.meta.dir, '../drizzle') });
    await configService.set(db, 'OIDC_ENABLED', 'true');
    await configService.set(db, 'USER_APPROVAL_REQUIRED', 'true');
    app = new Hono<AppContext>();
    app.use('*', async (c, next) => {
      c.set('db', db);
      await next();
    });
    app.route('/api/v1/auth', oidcAuthRoutes);
    app.route('/api/v1/admin/config', adminConfigRoutes);
    mocks.push(
      spyOn(oidcAuthService, 'completeAuthorization').mockImplementation((_db, _state, url) =>
        Promise.resolve({
          issuer: 'https://issuer.example.test/',
          claims: {
            iss: 'https://issuer.example.test/',
            sub: url.searchParams.get('code')!,
            aud: 'inkweld',
            exp: 9999999999,
            iat: 1,
            preferred_username: 'same-name',
          },
        })
      )
    );
  });

  afterEach(() => {
    mocks.forEach((mock) => mock.mockRestore());
    mocks.length = 0;
    sqlite.close();
  });

  function callback(subject: string, cookie = 'state-value') {
    return app.request(`/api/v1/auth/oidc?code=${subject}&state=state-value`, {
      headers: cookie ? { Cookie: `inkweld_oidc_state=${cookie}` } : {},
    });
  }

  it('sets an HttpOnly, SameSite=Lax browser cookie when starting sign-in', async () => {
    mocks.push(
      spyOn(oidcAuthService, 'createAuthorizationUrl').mockResolvedValue(
        new URL(
          'https://issuer.example.test/authorize?state=start-state&redirect_uri=https%3A%2F%2Fapp.example.test%2Fapi%2Fv1%2Fauth%2Foidc'
        )
      )
    );
    const response = await app.request('/api/v1/auth/oidc');
    expect(response.status).toBe(302);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('inkweld_oidc_state=start-state');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=600');
  });

  it('rejects callbacks from another browser before redeeming state', async () => {
    for (const cookie of ['', 'another-browser']) {
      const response = await callback('attacker', cookie);
      expect(response.headers.get('location')).toContain('error=oidc_auth_failed');
    }
    expect(oidcAuthService.completeAuthorization).not.toHaveBeenCalled();
    expect(await userService.countUsers(db)).toBe(0);
  });

  it.each([false, true])(
    'elects an active admin during concurrent first sign-ins (OIDC-only=%s)',
    async (oidcOnly) => {
      await configService.set(db, 'OIDC_ONLY', String(oidcOnly));
      // Both callbacks must see an empty instance before either account is inserted.
      mocks.push(spyOn(userService, 'countUsers').mockResolvedValue(0));
      const responses = await Promise.all([callback('first'), callback('second')]);
      responses.forEach((response) => {
        expect(response.headers.get('location')).toContain('code=');
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      });
      const users = await db.select().from(schema.users);
      expect(users).toHaveLength(2);
      expect(new Set(users.map((user) => user.username)).size).toBe(2);
      const admins = users.filter((user) => user.isAdmin);
      expect(admins).toHaveLength(1);
      expect(admins[0]).toMatchObject({ enabled: true, approved: true, rejectedAt: null });
    }
  );

  it('does not elect a pending user while the first approved account is still being created', async () => {
    mocks.push(spyOn(userService, 'countUsers').mockResolvedValueOnce(0).mockResolvedValueOnce(1));
    const create = userService.createOrUpdateOidcUser.bind(userService);
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.push(
      spyOn(userService, 'createOrUpdateOidcUser').mockImplementation(
        async (database, data, options) => {
          if (data.subject === 'first') await firstCanFinish;
          const user = await create(database, data, options);
          if (data.subject === 'second') releaseFirst();
          return user;
        }
      )
    );
    const responses = await Promise.all([callback('first'), callback('second')]);
    expect(responses[0].headers.get('location')).toContain('code=');
    expect(responses[1].headers.get('location')).toContain('approval-pending');
    const first = await userService.findByOidcIdentity(db, 'https://issuer.example.test/', 'first');
    const second = await userService.findByOidcIdentity(
      db,
      'https://issuer.example.test/',
      'second'
    );
    expect(first).toMatchObject({ isAdmin: true, approved: true, enabled: true });
    expect(second).toMatchObject({ isAdmin: false, approved: false });
  });

  it('does not promote disabled or rejected candidates and ignores inactive admins', async () => {
    const inactiveAdmin = await userService.create(
      db,
      { username: 'inactive' },
      { autoApprove: true }
    );
    await userService.setUserAdmin(db, inactiveAdmin.id, true);
    await userService.setUserEnabled(db, inactiveAdmin.id, false);
    const pending = await userService.create(db, { username: 'pending' }, { autoApprove: false });
    await userService.setUserAdminIfNoneExists(db, pending.id);
    expect((await userService.findById(db, pending.id))?.isAdmin).toBe(false);
    const disabled = await userService.create(db, { username: 'disabled' }, { autoApprove: true });
    await userService.setUserEnabled(db, disabled.id, false);
    await userService.setUserAdminIfNoneExists(db, disabled.id);
    expect((await userService.findById(db, disabled.id))?.isAdmin).toBe(false);
    const rejected = await userService.create(db, { username: 'rejected' }, { autoApprove: true });
    await userService.rejectUser(db, rejected.id);
    await userService.setUserAdminIfNoneExists(db, rejected.id);
    expect((await userService.findById(db, rejected.id))?.isAdmin).toBe(false);
    const active = await userService.create(db, { username: 'active' }, { autoApprove: true });
    await userService.setUserAdminIfNoneExists(db, active.id);
    expect((await userService.findById(db, active.id))?.isAdmin).toBe(true);
  });

  it('refuses OIDC-only activation without complete settings and protects active settings', async () => {
    const admin = await userService.create(db, { username: 'admin-user' }, { autoApprove: true });
    mocks.push(
      spyOn(authService, 'getUserFromSession').mockResolvedValue({ ...admin, isAdmin: true })
    );
    const set = (key: string, value: string) =>
      app.request(`/api/v1/admin/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
    expect((await set('OIDC_ONLY', 'true')).status).toBe(400);
    expect(await configService.getBoolean(db, 'OIDC_ONLY')).toBe(false);
    await Promise.all([
      configService.set(db, 'OIDC_ISSUER_URL', 'https://issuer.example.test/'),
      configService.set(db, 'OIDC_CLIENT_ID', 'client-id'),
      configService.set(db, 'OIDC_CLIENT_SECRET', 'client-secret'),
      configService.set(db, 'OIDC_CALLBACK_URL', 'https://app.example.test/api/v1/auth/oidc'),
    ]);
    expect((await set('OIDC_ONLY', 'true')).status).toBe(200);
    expect((await set('OIDC_CLIENT_SECRET', '')).status).toBe(400);
    expect(
      (await app.request('/api/v1/admin/config/OIDC_CLIENT_SECRET', { method: 'DELETE' })).status
    ).toBe(400);
    expect(await configService.getBoolean(db, 'OIDC_ONLY')).toBe(true);
  });

  it('validates normal OIDC activation and protects settings until both modes are disabled', async () => {
    const admin = await userService.create(db, { username: 'admin-user' }, { autoApprove: true });
    mocks.push(
      spyOn(authService, 'getUserFromSession').mockResolvedValue({ ...admin, isAdmin: true })
    );
    const set = (key: string, value: string) =>
      app.request(`/api/v1/admin/config/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
    await configService.set(db, 'OIDC_ENABLED', 'false');
    expect((await set('OIDC_ENABLED', 'true')).status).toBe(400);
    expect(await configService.getBoolean(db, 'OIDC_ENABLED')).toBe(false);
    await Promise.all([
      configService.set(db, 'OIDC_ISSUER_URL', 'https://issuer.example.test/'),
      configService.set(db, 'OIDC_CLIENT_ID', 'client-id'),
      configService.set(db, 'OIDC_CLIENT_SECRET', 'client-secret'),
      configService.set(db, 'OIDC_CALLBACK_URL', 'https://app.example.test/api/v1/auth/oidc'),
    ]);
    expect((await set('OIDC_ENABLED', '1')).status).toBe(200);
    expect((await set('OIDC_CLIENT_SECRET', '')).status).toBe(400);
    expect(
      (await app.request('/api/v1/admin/config/OIDC_CLIENT_SECRET', { method: 'DELETE' })).status
    ).toBe(400);
    expect((await set('OIDC_CLIENT_SECRET', 'rotated-secret')).status).toBe(200);
    expect((await configService.get(db, 'OIDC_CLIENT_SECRET')).value).toBe('rotated-secret');
    expect((await set('OIDC_ENABLED', 'false')).status).toBe(200);
    expect(
      (await app.request('/api/v1/admin/config/OIDC_CLIENT_SECRET', { method: 'DELETE' })).status
    ).toBe(200);
  });

  it.each(['activate', 'delete'] as const)(
    'rejects a stale %s after another writer changes the validated configuration',
    async (operation) => {
      const admin = await userService.create(db, { username: 'admin-user' }, { autoApprove: true });
      mocks.push(
        spyOn(authService, 'getUserFromSession').mockResolvedValue({ ...admin, isAdmin: true })
      );
      await Promise.all([
        configService.set(db, 'OIDC_ENABLED', 'false'),
        configService.set(db, 'OIDC_ONLY', 'false'),
        configService.set(db, 'OIDC_ISSUER_URL', 'https://issuer.example.test/'),
        configService.set(db, 'OIDC_CLIENT_ID', 'client-id'),
        configService.set(db, 'OIDC_CLIENT_SECRET', 'client-secret'),
        configService.set(db, 'OIDC_CALLBACK_URL', 'https://app.example.test/api/v1/auth/oidc'),
      ]);
      const update = configService.updateValidated.bind(configService);
      mocks.push(
        spyOn(configService, 'updateValidated').mockImplementation(
          (database, key, value, keys, validate) =>
            update(database, key, value, keys, (values) => {
              validate(values);
              // Simulate a competing process committing after validation but before the write.
              if (operation === 'activate') {
                sqlite.run("DELETE FROM config WHERE key = 'OIDC_CLIENT_SECRET'");
              } else {
                sqlite.run("UPDATE config SET value = 'true' WHERE key = 'OIDC_ONLY'");
              }
            })
        )
      );
      const response =
        operation === 'activate'
          ? await app.request('/api/v1/admin/config/OIDC_ONLY', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: 'true' }),
            })
          : await app.request('/api/v1/admin/config/OIDC_CLIENT_SECRET', { method: 'DELETE' });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: 'OIDC configuration changed concurrently; reload and retry',
      });
      expect(await configService.getBoolean(db, 'OIDC_ONLY')).toBe(operation === 'delete');
      if (operation === 'delete') {
        expect((await configService.get(db, 'OIDC_CLIENT_SECRET')).value).toBe('client-secret');
      }
    }
  );
});
