/**
 * The rule for new usernames: registration and check-username apply it,
 * GitHub sign-up derives a free name that fits it, and accounts whose names
 * predate it keep working.
 */
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { rm } from 'node:fs/promises';
import * as path from 'node:path';
import type { R2Bucket } from '@cloudflare/workers-types';
import { OpenAPIHono } from '@hono/zod-openapi';
import * as bcrypt from 'bcryptjs';
import { eq, inArray, like, sql, type SQL } from 'drizzle-orm';
import { config } from '../src/config/env';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { errorHandler } from '../src/middleware/error-handler';
import projectRoutes from '../src/routes/project.routes';
import userRoutes from '../src/routes/user.routes';
import {
  fitsUsernameRule,
  isReservedUsername,
  usernameBase,
  USERNAME_MAX_LENGTH,
} from '../src/schemas/auth.schemas';
import { sharesProjectDirectory } from '../src/services/project-data.service';
import { isUsernameConflict, userService } from '../src/services/user.service';
import type { AppContext } from '../src/types/context';
import { createObjectBucket } from './r2-bucket-mock';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

// Unique per run: the in-memory database is shared with every other suite.
const run = crypto.randomUUID().slice(0, 6);
const db = getDatabase();
/** Owners whose project directories the tests below create on disk. */
const ownersOnDisk: string[] = [];

/** Insert an approved account directly, bypassing the registration rule. */
async function insertUser(username: string, password?: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    username,
    password: password ? await bcrypt.hash(password, 10) : null,
    approved: true,
    enabled: true,
  });
  return id;
}

async function usersNamed(names: string[]): Promise<string[]> {
  const rows = await db
    .select({ username: users.username })
    .from(users)
    .where(inArray(users.username, names));
  return rows.map((row) => row.username ?? '');
}

afterAll(async () => {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.username, `%${run}%`));
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(projects).where(inArray(projects.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await Promise.all(
    ownersOnDisk.map((owner) =>
      rm(path.join(config.dataPath, owner), { recursive: true, force: true })
    )
  );
});

describe('username rule', () => {
  it('accepts ASCII letters, digits, hyphens and underscores, 3 to 39 characters', () => {
    expect(fitsUsernameRule('abc')).toBe(true);
    expect(fitsUsernameRule('Octo-Cat_42')).toBe(true);
    expect(fitsUsernameRule('a'.repeat(USERNAME_MAX_LENGTH))).toBe(true);
  });

  it('rejects separators, dots, spaces, other characters and lengths outside the limits', () => {
    for (const name of [
      'alice/bob',
      'alice:bob',
      'alice\\bob',
      'alice bob',
      'alice.bob',
      'alice@home',
      'josé',
      'ab',
      'a'.repeat(USERNAME_MAX_LENGTH + 1),
    ]) {
      expect(fitsUsernameRule(name)).toBe(false);
    }
  });

  it('compares reserved names ignoring case', () => {
    expect(isReservedUsername('Admin')).toBe(true);
    expect(isReservedUsername('SETTINGS')).toBe(true);
    expect(isReservedUsername('author')).toBe(false);
  });

  it('reserves the names the server uses beside usernames', () => {
    for (const name of ['worldbuilding', 'Worldbuilding', 'avatars', 'BANNERS', 'branding']) {
      expect(isReservedUsername(name)).toBe(true);
    }
    expect(isReservedUsername('worldbuilder')).toBe(false);
  });

  it('reduces provider names to a lower-case stem, with a fallback', () => {
    expect(usernameBase('--Dana.Fox__', 'fallback')).toBe('dana-fox');
    expect(usernameBase('a.b', 'fallback')).toBe('a-b');
    expect(usernameBase('é.', 'fallback')).toBe('fallback');
    expect(usernameBase('Privacy', 'fallback')).toBe('fallback');
  });
});

describe('username rule over HTTP', () => {
  let anon: TestClient;
  let baseUrl: string;

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    anon = new TestClient(baseUrl);
    await enablePasswordLoginForTests();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  function register(username: string) {
    return anon.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: TEST_PASSWORDS.E2E_ADMIN,
        email: `${crypto.randomUUID()}@example.com`,
      }),
    });
  }

  async function checkUsername(username: string) {
    const { response, json } = await anon.request(
      `/api/v1/users/check-username?username=${encodeURIComponent(username)}`
    );
    expect(response.status).toBe(200);
    return (await json()) as { available: boolean; reason?: string; suggestions: string[] };
  }

  describe('POST /api/v1/auth/register', () => {
    it('refuses names outside the rule and creates no account', async () => {
      const refused = [
        `reg${run}/x`,
        `reg${run}:x`,
        `reg${run}\\x`,
        `reg ${run}`,
        `reg.${run}`,
        `reg${run}`.padEnd(USERNAME_MAX_LENGTH + 1, 'x'),
      ];
      const statuses = await Promise.all(
        refused.map(async (name) => (await register(name)).response.status)
      );
      expect(statuses).toEqual(refused.map(() => 400));
      expect(await usersNamed(refused)).toEqual([]);
    });

    it('accepts GitHub-style names and keeps their case', async () => {
      const accepted = [`Octo-Cat_${run}`, `GH${run}`.padEnd(USERNAME_MAX_LENGTH, 'q')];
      const statuses = await Promise.all(
        accepted.map(async (name) => (await register(name)).response.status)
      );
      expect(statuses).toEqual([200, 200]);
      expect((await usersNamed(accepted)).sort()).toEqual([...accepted].sort());
    });

    it('refuses a name that matches an existing one ignoring case', async () => {
      const first = `Case${run}`;
      expect((await register(first)).response.status).toBe(200);

      const { response, json } = await register(first.toLowerCase());
      expect(response.status).toBe(400);
      expect(await json()).toMatchObject({ code: 'USERNAME_TAKEN' });
      expect(await usersNamed([first.toLowerCase()])).toEqual([]);
    });

    it('still refuses reserved names in any case', async () => {
      expect((await register('Settings')).response.status).toBe(400);
    });

    it('refuses the names the server uses beside usernames', async () => {
      const statuses = await Promise.all(
        ['worldbuilding', 'Avatars'].map(async (name) => (await register(name)).response.status)
      );
      expect(statuses).toEqual([400, 400]);
      expect(await usersNamed(['worldbuilding', 'Avatars'])).toEqual([]);
    });

    it('lets only one of overlapping registrations that differ only in case through', async () => {
      const names = [`Race${run}`, `race${run}`, `RACE${run}`, `rAce${run}`];
      const responses = await Promise.all(names.map((name) => register(name)));

      const statuses = responses.map(({ response }) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 400)).toHaveLength(names.length - 1);
      const refusals = await Promise.all(
        responses
          .filter(({ response }) => response.status === 400)
          .map(async ({ json }) => (await json()) as { code?: string })
      );
      expect(refusals.map((body) => body.code)).toEqual(names.slice(1).map(() => 'USERNAME_TAKEN'));
      expect(await usersNamed(names)).toHaveLength(1);
    });
  });

  describe('GET /api/v1/users/check-username', () => {
    it('reports a name outside the rule as invalid and suggests one that fits', async () => {
      const result = await checkUsername(`chk.${run}`);
      expect(result).toMatchObject({ available: false, reason: 'invalid' });
      expect(result.suggestions).toContain(`chk-${run}`);
      expect(result.suggestions.every(fitsUsernameRule)).toBe(true);
    });

    it('reports a name that is too long as invalid, with suggestions that fit', async () => {
      const result = await checkUsername(`long${run}`.padEnd(USERNAME_MAX_LENGTH + 5, 'z'));
      expect(result.reason).toBe('invalid');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.every(fitsUsernameRule)).toBe(true);
    });

    it('reports a reserved name', async () => {
      const result = await checkUsername('Settings');
      expect(result).toMatchObject({ available: false, reason: 'reserved' });
      expect(result.suggestions.every((name) => !isReservedUsername(name))).toBe(true);
    });

    it('reports a name the server uses beside usernames as reserved', async () => {
      expect(await checkUsername('Worldbuilding')).toMatchObject({
        available: false,
        reason: 'reserved',
      });
    });

    it('reports a name taken in another case, and leaves taken names out of suggestions', async () => {
      await insertUser(`Taken${run}`);
      await insertUser(`taken${run}123`);

      const result = await checkUsername(`TAKEN${run}`);
      expect(result).toMatchObject({ available: false, reason: 'taken' });
      expect(result.suggestions).toEqual([`TAKEN${run}_new`]);
    });

    it('reports a free name as available', async () => {
      expect(await checkUsername(`Free_${run}`)).toEqual({ available: true, suggestions: [] });
    });
  });

  describe('accounts whose usernames predate the rule', () => {
    async function signIn(username: string): Promise<TestClient> {
      const client = new TestClient(baseUrl);
      expect(await client.login(username, TEST_PASSWORDS.DEFAULT)).toBe(true);
      return client;
    }

    function createProject(client: TestClient, slug: string) {
      return client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: slug }),
      });
    }

    /** Project routes with R2 storage, signed in as `client`'s user. */
    function onR2(bucket: R2Bucket, client: TestClient) {
      const app = new OpenAPIHono<AppContext>();
      app.use('*', async (c, next) => {
        c.set('db', db);
        c.set('storage', bucket);
        await next();
      });
      app.onError(errorHandler);
      app.route('/api/v1/projects', projectRoutes);
      app.route('/api/v1/users', userRoutes);
      const token = (client as unknown as { token: string }).token;
      return (route: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('Content-Type', 'application/json');
        return app.request(route, { ...init, headers });
      };
    }

    it('still sign in, create projects and open them', async () => {
      const legacy = `Legacy.User_${run}`;
      ownersOnDisk.push(legacy);
      await insertUser(legacy, TEST_PASSWORDS.DEFAULT);
      const client = new TestClient(baseUrl);
      expect(await client.login(legacy, TEST_PASSWORDS.DEFAULT)).toBe(true);

      const created = await client.request('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'old-novel', title: 'Old Novel' }),
      });
      expect(created.response.status).toBe(201);
      expect(await created.json()).toMatchObject({ username: legacy, slug: 'old-novel' });

      const owner = encodeURIComponent(legacy);
      const opened = await client.request(`/api/v1/projects/${owner}/old-novel`);
      expect(opened.response.status).toBe(200);
      expect(await opened.json()).toMatchObject({ slug: 'old-novel' });

      const media = await client.request(`/api/v1/media/${owner}/old-novel`);
      expect(media.response.status).toBe(200);
    });

    it('that differ only in letter case cannot give two projects one directory', async () => {
      const [first, second] = [`Twin${run}`, `twin${run}`];
      ownersOnDisk.push(first, second);
      await Promise.all([first, second].map((name) => insertUser(name, TEST_PASSWORDS.DEFAULT)));
      const [a, b] = await Promise.all([signIn(first), signIn(second)]);

      expect((await createProject(a, 'shared')).response.status).toBe(201);
      // On a case-insensitive file system both would be <data>/twin…/shared.
      expect((await createProject(b, 'shared')).response.status).toBe(400);

      expect((await createProject(b, 'mine')).response.status).toBe(201);
      const renamed = await b.request(`/api/v1/projects/${second}/mine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'shared' }),
      });
      expect(renamed.response.status).toBe(400);

      const kept = await a.request(`/api/v1/projects/${first}/shared`);
      expect(kept.response.status).toBe(200);
    });

    it('whose names fold to a new name cannot give two projects one directory', async () => {
      // U+017F LATIN SMALL LETTER LONG S: lower() leaves it, so `Solo…` is
      // free, but case-insensitive file systems fold it to `s`.
      const [older, newer] = [`\u017Folo${run}`, `Solo${run}`];
      ownersOnDisk.push(older, newer);
      await insertUser(older, TEST_PASSWORDS.DEFAULT);
      expect(await userService.isUsernameTaken(db, newer)).toBe(false);
      await insertUser(newer, TEST_PASSWORDS.DEFAULT);
      const [a, b] = await Promise.all([signIn(older), signIn(newer)]);

      expect((await createProject(a, 'novel')).response.status).toBe(201);
      expect((await createProject(b, 'novel')).response.status).toBe(400);
      expect((await createProject(b, 'other')).response.status).toBe(201);
    });

    it('can share a slug on R2, where keys are compared exactly', async () => {
      const bucket = createObjectBucket().bucket;
      const context = { get: (key: string) => (key === 'storage' ? bucket : db) };
      const other = await insertUser(`R2twin${run}`);
      const now = Date.now();
      await db.insert(projects).values({
        slug: 'novel',
        title: 'Novel',
        userId: other,
        createdDate: now,
        updatedDate: now,
      });

      expect(
        await sharesProjectDirectory(context as never, crypto.randomUUID(), `r2TWIN${run}`, 'novel')
      ).toBe(false);
      const onDisk = { get: (key: string) => (key === 'storage' ? undefined : db) };
      expect(
        await sharesProjectDirectory(onDisk as never, crypto.randomUUID(), `r2TWIN${run}`, 'novel')
      ).toBe(true);
    });

    it('with a separator in the name can still delete projects and the account on R2', async () => {
      const neighbour = `keep${run}`;
      const legacy = `${neighbour}/novel`;
      await insertUser(neighbour);
      const legacyId = await insertUser(legacy, TEST_PASSWORDS.DEFAULT);
      const r2 = createObjectBucket();
      const neighbourKey = `${neighbour}/novel/published/file-1`;
      r2.seed(neighbourKey, 'neighbour', 'application/pdf');
      const send = onR2(r2.bucket, await signIn(legacy));

      // A new project still can't be made: its files would have no key of their own.
      const created = await send('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ slug: 'published', title: 'Published' }),
      });
      expect(created.status).toBe(500);
      expect(r2.text(neighbourKey)).toBe('neighbour');

      // Projects from before the rule can be deleted; their files stay where they are.
      const now = Date.now();
      await db.insert(projects).values(
        ['published', 'draft'].map((slug) => ({
          slug,
          title: slug,
          userId: legacyId,
          createdDate: now,
          updatedDate: now,
        }))
      );
      const owner = encodeURIComponent(legacy);
      expect((await send(`/api/v1/projects/${owner}/published`, { method: 'DELETE' })).status).toBe(
        200
      );
      expect(r2.text(neighbourKey)).toBe('neighbour');

      // So can the account, with its remaining project.
      const deleted = await send('/api/v1/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmUsername: legacy }),
      });
      expect(deleted.status).toBe(200);
      expect(await usersNamed([legacy])).toEqual([]);
      expect(await db.select().from(projects).where(eq(projects.userId, legacyId))).toEqual([]);
      expect([...r2.store.keys()]).toEqual([neighbourKey]);
    });
  });
});

describe('lower(username) lookups', () => {
  async function plan(query: SQL): Promise<string> {
    const rows = (await db.all(sql`EXPLAIN QUERY PLAN ${query}`)) as Array<{ detail: string }>;
    return rows.map((row) => row.detail).join('\n');
  }

  it('search the lower(username) index instead of scanning users', async () => {
    const lowered = sql`lower(${users.username})`;
    // The shape userService.findTakenUsernames sends.
    const taken = await plan(
      sql`select ${lowered} from ${users} where ${inArray(lowered, ['alice', 'bob'])}`
    );
    // The lookup inside a new account's INSERT.
    const insertCheck = await plan(
      sql`select ${users.username} from ${users} where ${lowered} = lower(${'Alice'}) limit 1`
    );

    for (const detail of [taken, insertCheck]) {
      expect(detail).toContain('users_username_lower_idx');
      expect(detail).not.toMatch(/SCAN users\b/);
    }
  });
});

describe('userService.create', () => {
  it('refuses a username an account has in another case, even when asked directly', async () => {
    await insertUser(`Exist${run}`);
    const error = await userService
      .create(db, { username: `exist${run}` }, { autoApprove: true })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(isUsernameConflict(error)).toBe(true);
    expect(await usersNamed([`exist${run}`])).toEqual([]);
  });

  it('creates an account whose username no account has in any case', async () => {
    const user = await userService.create(db, { username: `Fresh${run}` }, { autoApprove: true });
    expect(user.username).toBe(`Fresh${run}`);
  });
});

describe('userService.availableUsername', () => {
  it('returns the base when no account has it', async () => {
    expect(await userService.availableUsername(db, `avfree${run}`)).toBe(`avfree${run}`);
  });

  it('adds the lowest free suffix, comparing names ignoring case', async () => {
    await insertUser(`AvCase${run}`);
    await insertUser(`avcase${run}-2`);
    expect(await userService.availableUsername(db, `avcase${run}`)).toBe(`avcase${run}-3`);
  });

  it('skips reserved names', async () => {
    const name = await userService.availableUsername(db, 'settings');
    expect(name).toMatch(/^settings-\d+$/);
    expect(await userService.availableUsername(db, 'worldbuilding')).toMatch(/^worldbuilding-\d+$/);
  });

  it('reduces a base outside the rule to a name that fits', async () => {
    expect(await userService.availableUsername(db, `Odd Name!${run}`)).toBe(`odd-name-${run}`);
    expect(fitsUsernameRule(await userService.availableUsername(db, ''))).toBe(true);
  });

  it('keeps suffixed names within the length limit', async () => {
    const base = `cap${run}`.padEnd(USERNAME_MAX_LENGTH, 'c');
    await insertUser(base);
    const name = await userService.availableUsername(db, base);
    expect(name).toBe(`${base.slice(0, USERNAME_MAX_LENGTH - 2)}-2`);
    expect(fitsUsernameRule(name)).toBe(true);
  });

  it('falls back to a random suffix when every numbered name is taken', async () => {
    const taken = spyOn(userService, 'findTakenUsernames').mockImplementation((_db, names) =>
      Promise.resolve(new Set(names.map((name) => name.toLowerCase())))
    );
    try {
      const name = await userService.availableUsername(db, `full${run}`);
      expect(name).toMatch(new RegExp(`^full${run}-[0-9a-f]{8}$`));
      expect(fitsUsernameRule(name)).toBe(true);
    } finally {
      taken.mockRestore();
    }
  });
});

describe('createOrUpdateGithubUser usernames', () => {
  const githubUser = (login: string) =>
    userService.createOrUpdateGithubUser(db, {
      githubId: `gh-${crypto.randomUUID()}`,
      username: login,
      email: '',
      name: login,
    });

  it('uses a free GitHub login as it is', async () => {
    expect((await githubUser(`GhFree-${run}`)).username).toBe(`GhFree-${run}`);
  });

  it('gives a login another account already has a numeric suffix', async () => {
    await insertUser(`ghtaken${run}`);
    expect((await githubUser(`ghtaken${run}`)).username).toBe(`ghtaken${run}-2`);
  });

  it('gives a login that matches another account ignoring case a numeric suffix', async () => {
    await insertUser(`GhCase${run}`);
    expect((await githubUser(`ghcase${run}`)).username).toBe(`ghcase${run}-2`);
  });

  it('does not take a reserved name', async () => {
    const user = await githubUser('Settings');
    expect(user.username).toMatch(/^Settings-\d+$/);
    await db.delete(users).where(inArray(users.id, [user.id]));
  });

  it.each(['public', 'Public', 'PUBLIC'])(
    'does not take the public project route name %s',
    async (login) => {
      const user = await githubUser(login);
      try {
        expect(user.username).toMatch(new RegExp(`^${login}-\\d+$`));
      } finally {
        await db.delete(users).where(eq(users.id, user.id));
      }
    }
  );

  it('reduces a login outside the rule to a name that fits', async () => {
    expect((await githubUser(`Odd.Login.${run}`)).username).toBe(`odd-login-${run}`);
  });

  it('gives a login shorter than the minimum a numeric suffix', async () => {
    const user = await githubUser('tj');
    try {
      expect(user.username).toBe('tj-2');
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
