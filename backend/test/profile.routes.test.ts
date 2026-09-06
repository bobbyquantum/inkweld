import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';
import { writingSessions } from '../src/db/schema/writing-sessions';
import type { ProfileVisibility } from '../src/db/schema/users';
import {
  startTestServer,
  stopTestServer,
  TestClient,
  enablePasswordLoginForTests,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

interface ProfileDto {
  username: string;
  name: string | null;
  bio: string | null;
  hasAvatar: boolean;
  isOwner: boolean;
  appearance: { background: { kind: string; presetId?: string }; hasBanner: boolean };
  sections: { activity: boolean; projects: boolean };
  visibility?: { profile: string; activity: string; projects: string };
  projects?: Array<{ slug: string; title: string }>;
}

interface ActivityDto {
  year: number;
  timeZone: string;
  days: Array<{ day: string; words: number; sessions: number }>;
  totalWords: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  availableYears: number[];
}

/** A valid 1x1 transparent PNG, small enough to inline and real enough for sharp. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const OWNER = 'profowner';
const VIEWER = 'profviewer';
const ADMIN = 'profadmin';

describe('Profile Routes', () => {
  let ownerClient: TestClient;
  let viewerClient: TestClient;
  let adminClient: TestClient;
  let anonClient: TestClient;
  let ownerId: string;
  let viewerId: string;
  let adminId: string;
  let projectId: string;

  async function setVisibility(v: {
    profile?: ProfileVisibility;
    activity?: ProfileVisibility;
    projects?: ProfileVisibility;
  }): Promise<void> {
    const db = getDatabase();
    await db
      .update(users)
      .set({
        profileVisibility: v.profile ?? 'private',
        activityVisibility: v.activity ?? 'public',
        projectsVisibility: v.projects ?? 'private',
      })
      .where(eq(users.id, ownerId));
  }

  async function seedSession(delta: number, sessionEnd: number): Promise<void> {
    const db = getDatabase();
    await db.insert(writingSessions).values({
      id: crypto.randomUUID(),
      projectId,
      elementId: 'el-1',
      userId: ownerId,
      sessionStart: sessionEnd - 60_000,
      sessionEnd,
      startWordCount: 0,
      endWordCount: Math.max(delta, 0),
      wordsDelta: delta,
    });
  }

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    await enablePasswordLoginForTests();
    ownerClient = new TestClient(baseUrl);
    viewerClient = new TestClient(baseUrl);
    adminClient = new TestClient(baseUrl);
    anonClient = new TestClient(baseUrl);

    const db = getDatabase();
    for (const u of [OWNER, VIEWER, ADMIN]) {
      await db.delete(users).where(eq(users.username, u));
    }
    const hashed = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);

    const [owner] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: OWNER,
        name: 'Prof Owner',
        email: `${OWNER}@example.com`,
        password: hashed,
        approved: true,
        enabled: true,
        bio: 'Writes slow-burn fantasy.',
      })
      .returning();
    ownerId = owner.id;

    const [viewer] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: VIEWER,
        email: `${VIEWER}@example.com`,
        password: hashed,
        approved: true,
        enabled: true,
      })
      .returning();
    viewerId = viewer.id;

    const [admin] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        username: ADMIN,
        email: `${ADMIN}@example.com`,
        password: hashed,
        approved: true,
        enabled: true,
        isAdmin: true,
      })
      .returning();
    adminId = admin.id;

    const [project] = await db
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        slug: 'prof-novel',
        title: 'Profile Novel',
        description: 'A test novel',
        userId: ownerId,
        createdDate: Date.now(),
        updatedDate: Date.now(),
      })
      .returning();
    projectId = project.id;

    expect(await ownerClient.login(OWNER, TEST_PASSWORDS.DEFAULT)).toBe(true);
    expect(await viewerClient.login(VIEWER, TEST_PASSWORDS.DEFAULT)).toBe(true);
    expect(await adminClient.login(ADMIN, TEST_PASSWORDS.DEFAULT)).toBe(true);
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(writingSessions).where(eq(writingSessions.userId, ownerId));
    await db.delete(projects).where(eq(projects.userId, ownerId));
    for (const id of [ownerId, viewerId, adminId]) {
      await db.delete(users).where(eq(users.id, id));
    }
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();
    await db.delete(writingSessions).where(eq(writingSessions.userId, ownerId));
    await setVisibility({});
  });

  // ──────────────── GET /:username/profile ────────────────

  describe('GET /api/v1/users/:username/profile', () => {
    it('404s for an unknown user', async () => {
      const { response } = await anonClient.request('/api/v1/users/nobody-here/profile');
      expect(response.status).toBe(404);
    });

    it('is private by default: 403 for anonymous and other members', async () => {
      const anon = await anonClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(anon.response.status).toBe(403);
      const member = await viewerClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(member.response.status).toBe(403);
    });

    it('always lets the owner see everything, with the visibility settings', async () => {
      const { response, json } = await ownerClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(response.status).toBe(200);
      const body = (await json()) as ProfileDto;
      expect(body.isOwner).toBe(true);
      expect(body.bio).toBe('Writes slow-burn fantasy.');
      expect(body.sections).toEqual({ activity: true, projects: true });
      expect(body.visibility).toEqual({
        profile: 'private',
        activity: 'public',
        projects: 'private',
      });
      expect(body.projects?.map((p) => p.slug)).toEqual(['prof-novel']);
    });

    it('lets admins see a private profile with settings', async () => {
      const { response, json } = await adminClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(response.status).toBe(200);
      const body = (await json()) as ProfileDto;
      expect(body.isOwner).toBe(false);
      expect(body.visibility?.profile).toBe('private');
    });

    it('members-only: hidden from anonymous, shown to signed-in users', async () => {
      await setVisibility({ profile: 'members' });
      const anon = await anonClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(anon.response.status).toBe(403);

      const { response, json } = await viewerClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(response.status).toBe(200);
      const body = (await json()) as ProfileDto;
      expect(body.isOwner).toBe(false);
      expect(body.visibility).toBeUndefined();
      expect(body.name).toBe('Prof Owner');
    });

    it('public profile: anonymous sees the card and the public sections only', async () => {
      await setVisibility({ profile: 'public', activity: 'public', projects: 'private' });
      const { response, json } = await anonClient.request(`/api/v1/users/${OWNER}/profile`);
      expect(response.status).toBe(200);
      const body = (await json()) as ProfileDto;
      expect(body.sections).toEqual({ activity: true, projects: false });
      expect(body.projects).toBeUndefined();
      expect(body.visibility).toBeUndefined();
    });

    it('section levels narrow but never widen the profile level', async () => {
      await setVisibility({ profile: 'public', activity: 'members', projects: 'public' });
      const anon = (await (
        await anonClient.request(`/api/v1/users/${OWNER}/profile`)
      ).json()) as ProfileDto;
      expect(anon.sections).toEqual({ activity: false, projects: true });
      expect(anon.projects?.[0]?.title).toBe('Profile Novel');

      const member = (await (
        await viewerClient.request(`/api/v1/users/${OWNER}/profile`)
      ).json()) as ProfileDto;
      expect(member.sections).toEqual({ activity: true, projects: true });
    });
  });

  // ──────────────── GET /:username/activity ────────────────

  describe('GET /api/v1/users/:username/activity', () => {
    it('is gated by the effective activity visibility', async () => {
      await setVisibility({ profile: 'public', activity: 'members' });
      const anon = await anonClient.request(`/api/v1/users/${OWNER}/activity`);
      expect(anon.response.status).toBe(403);
      const member = await viewerClient.request(`/api/v1/users/${OWNER}/activity`);
      expect(member.response.status).toBe(200);
    });

    it('404s for unknown users', async () => {
      const { response } = await ownerClient.request('/api/v1/users/nobody-here/activity');
      expect(response.status).toBe(404);
    });

    it('returns a full year of days with totals and streaks', async () => {
      const year = new Date().getUTCFullYear();
      // Three consecutive days in early March, plus a negative delta that must be ignored.
      const d = (day: number) => Date.UTC(year, 2, day, 12);
      await seedSession(100, d(3));
      await seedSession(50, d(3));
      await seedSession(200, d(4));
      await seedSession(25, d(5));
      await seedSession(-500, d(6));

      const { response, json } = await ownerClient.request(
        `/api/v1/users/${OWNER}/activity?year=${year}&tz=UTC`
      );
      expect(response.status).toBe(200);
      const body = (await json()) as ActivityDto;

      expect(body.year).toBe(year);
      expect(body.timeZone).toBe('UTC');
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      expect(body.days).toHaveLength(isLeap ? 366 : 365);
      expect(body.days[0].day).toBe(`${year}-01-01`);

      const mar3 = body.days.find((x) => x.day === `${year}-03-03`);
      expect(mar3).toEqual({ day: `${year}-03-03`, words: 150, sessions: 2 });
      expect(body.days.find((x) => x.day === `${year}-03-06`)?.words).toBe(0);
      expect(body.totalWords).toBe(375);
      expect(body.activeDays).toBe(3);
      expect(body.longestStreak).toBe(3);
      expect(body.availableYears).toContain(year);
      expect(body.availableYears[0]).toBeGreaterThanOrEqual(year);
    });

    it('buckets days in the requested timezone', async () => {
      const year = new Date().getUTCFullYear();
      // 23:30 UTC on Jun 10 is Jun 11 in Tokyo.
      await seedSession(40, Date.UTC(year, 5, 10, 23, 30));

      const utc = (await (
        await ownerClient.request(`/api/v1/users/${OWNER}/activity?year=${year}&tz=UTC`)
      ).json()) as ActivityDto;
      expect(utc.days.find((x) => x.day === `${year}-06-10`)?.words).toBe(40);

      const tokyo = (await (
        await ownerClient.request(`/api/v1/users/${OWNER}/activity?year=${year}&tz=Asia/Tokyo`)
      ).json()) as ActivityDto;
      expect(tokyo.timeZone).toBe('Asia/Tokyo');
      expect(tokyo.days.find((x) => x.day === `${year}-06-11`)?.words).toBe(40);
      expect(tokyo.days.find((x) => x.day === `${year}-06-10`)?.words).toBe(0);
    });

    it('falls back to UTC and the current year for bad params', async () => {
      const year = new Date().getUTCFullYear();
      const { response, json } = await ownerClient.request(
        `/api/v1/users/${OWNER}/activity?year=1999&tz=Not/AZone`
      );
      expect(response.status).toBe(200);
      const body = (await json()) as ActivityDto;
      expect(body.year).toBe(year);
      expect(body.timeZone).toBe('UTC');
    });

    it('anchors the current streak to today even when viewing a past year', async () => {
      const year = new Date().getUTCFullYear();
      const today = Date.UTC(year, new Date().getUTCMonth(), new Date().getUTCDate(), 12);
      await seedSession(10, today);
      await seedSession(10, today - 24 * 60 * 60 * 1000);
      await seedSession(10, Date.UTC(year - 1, 6, 1));

      const past = (await (
        await ownerClient.request(`/api/v1/users/${OWNER}/activity?year=${year - 1}&tz=UTC`)
      ).json()) as ActivityDto;
      expect(past.year).toBe(year - 1);
      expect(past.totalWords).toBe(10);
      expect(past.currentStreak).toBe(2);
    });

    it('lists every year the user has written in', async () => {
      const year = new Date().getUTCFullYear();
      await seedSession(10, Date.UTC(year - 2, 6, 1));
      const body = (await (
        await ownerClient.request(`/api/v1/users/${OWNER}/activity?year=${year - 2}`)
      ).json()) as ActivityDto;
      expect(body.availableYears).toEqual([year, year - 1, year - 2]);
      expect(body.totalWords).toBe(10);
    });
  });

  // ──────────────── Profile appearance ────────────────

  describe('profile appearance', () => {
    function bannerForm(bytes: Buffer | string, filename = 'banner.png'): FormData {
      const form = new FormData();
      form.append('banner', new Blob([bytes], { type: 'image/png' }), filename);
      return form;
    }

    async function ownerProfile(): Promise<ProfileDto> {
      const { json } = await ownerClient.request(`/api/v1/users/${OWNER}/profile`);
      return (await json()) as ProfileDto;
    }

    afterAll(async () => {
      await ownerClient.request('/api/v1/users/me/banner', { method: 'DELETE' });
      await ownerClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plain' }),
      });
    });

    it('defaults to a plain background with no banner', async () => {
      const body = await ownerProfile();
      expect(body.appearance).toEqual({ background: { kind: 'plain' }, hasBanner: false });
    });

    it('stores a preset background and shows it to viewers', async () => {
      const { response, json } = await ownerClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'preset', presetId: 'dusk' }),
      });
      expect(response.status).toBe(200);
      expect(await json()).toEqual({ kind: 'preset', presetId: 'dusk' });

      await setVisibility({ profile: 'public' });
      const seen = (await (
        await anonClient.request(`/api/v1/users/${OWNER}/profile`)
      ).json()) as ProfileDto;
      expect(seen.appearance.background).toEqual({ kind: 'preset', presetId: 'dusk' });

      // Back to plain drops the preset id entirely.
      const reset = await ownerClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plain', presetId: 'dusk' }),
      });
      expect(await reset.json()).toEqual({ kind: 'plain' });
      expect((await ownerProfile()).appearance.background).toEqual({ kind: 'plain' });
    });

    it('rejects unknown presets, a preset without an id, and anonymous callers', async () => {
      const unknown = await ownerClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'preset', presetId: 'lava-lamp' }),
      });
      expect(unknown.response.status).toBe(400);

      const missing = await ownerClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'preset' }),
      });
      expect(missing.response.status).toBe(400);

      const anon = await anonClient.request('/api/v1/users/me/profile-background', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plain' }),
      });
      expect(anon.response.status).toBe(401);
    });

    it('uploads, serves, gates and deletes a banner', async () => {
      const upload = await ownerClient.request('/api/v1/users/me/banner', {
        method: 'POST',
        body: bannerForm(ONE_PIXEL_PNG),
      });
      expect(upload.response.status).toBe(200);
      expect((await ownerProfile()).appearance.hasBanner).toBe(true);

      // Owner can always fetch it.
      const own = await ownerClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(own.response.status).toBe(200);
      expect(own.response.headers.get('content-type')).toMatch(/^image\//);
      expect((await own.response.arrayBuffer()).byteLength).toBeGreaterThan(0);

      // Private profile: the banner URL must not leak to others.
      const anonPrivate = await anonClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(anonPrivate.response.status).toBe(403);
      const memberPrivate = await viewerClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(memberPrivate.response.status).toBe(403);

      await setVisibility({ profile: 'public' });
      const anonPublic = await anonClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(anonPublic.response.status).toBe(200);

      const del = await ownerClient.request('/api/v1/users/me/banner', { method: 'DELETE' });
      expect(del.response.status).toBe(200);
      expect((await ownerProfile()).appearance.hasBanner).toBe(false);
      const gone = await ownerClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(gone.response.status).toBe(404);
    });

    it('404s for a banner nobody uploaded and for unknown users', async () => {
      const none = await ownerClient.request(`/api/v1/users/${OWNER}/banner`);
      expect(none.response.status).toBe(404);
      const nobody = await ownerClient.request('/api/v1/users/nobody-here/banner');
      expect(nobody.response.status).toBe(404);
    });

    it('refuses non-image banners, empty uploads and anonymous uploads', async () => {
      const bogus = await ownerClient.request('/api/v1/users/me/banner', {
        method: 'POST',
        body: bannerForm('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'banner.svg'),
      });
      expect(bogus.response.status).toBe(400);
      expect((await ownerProfile()).appearance.hasBanner).toBe(false);

      const empty = await ownerClient.request('/api/v1/users/me/banner', {
        method: 'POST',
        body: new FormData(),
      });
      expect(empty.response.status).toBe(400);

      const anon = await anonClient.request('/api/v1/users/me/banner', {
        method: 'POST',
        body: bannerForm(ONE_PIXEL_PNG),
      });
      expect(anon.response.status).toBe(401);
    });
  });

  // ──────────────── PATCH /me ────────────────

  describe('PATCH /api/v1/users/me visibility fields', () => {
    it('updates bio and visibility and echoes them back', async () => {
      const { response, json } = await ownerClient.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio: '  New bio  ',
          profileVisibility: 'public',
          activityVisibility: 'members',
          projectsVisibility: 'private',
        }),
      });
      expect(response.status).toBe(200);
      const body = (await json()) as Record<string, unknown>;
      expect(body.bio).toBe('New bio');
      expect(body.profileVisibility).toBe('public');
      expect(body.activityVisibility).toBe('members');
      expect(body.projectsVisibility).toBe('private');

      const me = (await (await ownerClient.request('/api/v1/users/me')).json()) as Record<
        string,
        unknown
      >;
      expect(me.profileVisibility).toBe('public');
      expect(me.bio).toBe('New bio');
    });

    it('rejects unknown visibility levels and over-long bios', async () => {
      const bad = await ownerClient.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileVisibility: 'friends' }),
      });
      expect(bad.response.status).toBe(400);

      const long = await ownerClient.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: 'x'.repeat(501) }),
      });
      expect(long.response.status).toBe(400);
    });

    it('clears the bio when an empty string is sent', async () => {
      const { json } = await ownerClient.request('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: '' }),
      });
      expect(((await json()) as Record<string, unknown>).bio).toBeNull();
    });
  });
});
