/**
 * Unit tests for resolveProjectAccess — the shared project-access resolver
 * used by BOTH the WebSocket auth path and the DO HTTP API.
 *
 * Regression for the cross-tenant IDOR: the DO HTTP API previously verified
 * only the JWT and never checked project membership, so any authenticated
 * user could read/mutate any project's documents via
 * GET/POST /api/v1/ws/yjs/do/:endpoint?documentId=user:slug:...
 *
 * IMPORTANT: the resolver's data lookups are injected (not `mock.module`).
 * Bun's `mock.module` replaces a module for the ENTIRE `bun test` process, so
 * mocking the project/collaboration services here would corrupt every other
 * test file that imports them and fail the whole suite.
 */
import { describe, it, expect } from 'bun:test';
import {
  isActiveSiteAdmin,
  resolveProjectAccess,
  type ProjectAccessDeps,
} from '../src/utils/project-access';

const ACTIVE_USER = { enabled: true, approved: true, sessionsValidFrom: 0 };

const fakeDeps: ProjectAccessDeps = {
  findUserById: async (_db, userId) => {
    if (userId === 'disabled-1') return { ...ACTIVE_USER, enabled: false };
    if (userId === 'unapproved-1') return { ...ACTIVE_USER, approved: false };
    if (userId === 'reset-1') return { ...ACTIVE_USER, sessionsValidFrom: 1_000_000 };
    if (userId === 'ghost-1') return undefined;
    return ACTIVE_USER;
  },
  findByUsernameAndSlug: async (_db, username, slug) => {
    if (username === 'missing' || slug === 'missing') return undefined;
    return {
      id: 'project-1',
      userId: 'owner-1',
      slug,
      username,
      title: 'Test Project',
    };
  },
  checkAccess: async (_db, _projectId, userId) => {
    if (userId === 'editor-1') {
      return {
        isOwner: false,
        isCollaborator: true,
        role: 'editor',
        canRead: true,
        canWrite: true,
        canAdmin: false,
      };
    }
    if (userId === 'viewer-1') {
      return {
        isOwner: false,
        isCollaborator: true,
        role: 'viewer',
        canRead: true,
        canWrite: false,
        canAdmin: false,
      };
    }
    return {
      isOwner: false,
      isCollaborator: false,
      role: null,
      canRead: false,
      canWrite: false,
      canAdmin: false,
    };
  },
};

describe('resolveProjectAccess', () => {
  const db = {} as never;

  it('allows the owner (userId claim) full write access', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        userId: 'owner-1',
        username: 'alice',
      },
      fakeDeps
    );
    expect(result).toEqual({
      ok: true,
      access: { canWrite: true, projectDbId: 'project-1', role: null },
    });
  });

  it('allows the owner via the OAuth sub claim', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        sub: 'owner-1',
        username: 'alice',
      },
      fakeDeps
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access.canWrite).toBe(true);
    }
  });

  it('allows an editor collaborator with write access', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        userId: 'editor-1',
        username: 'bob',
      },
      fakeDeps
    );
    expect(result).toEqual({
      ok: true,
      access: { canWrite: true, projectDbId: 'project-1', role: 'editor' },
    });
  });

  it('allows a viewer collaborator with read-only access', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        userId: 'viewer-1',
        username: 'carol',
      },
      fakeDeps
    );
    expect(result).toEqual({
      ok: true,
      access: { canWrite: false, projectDbId: 'project-1', role: 'viewer' },
    });
  });

  it('denies a non-collaborator with forbidden', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        userId: 'stranger-1',
        username: 'mallory',
      },
      fakeDeps
    );
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('denies with project-not-found when the project does not exist', async () => {
    const result = await resolveProjectAccess(
      db,
      'missing',
      'missing',
      {
        userId: 'owner-1',
        username: 'alice',
      },
      fakeDeps
    );
    expect(result).toEqual({ ok: false, reason: 'project-not-found' });
  });

  it('denies a user with no userId/sub claim', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      {
        username: 'ghost',
      },
      fakeDeps
    );
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  describe('legacy no-D1 mode', () => {
    it('allows the owner (username match)', async () => {
      const result = await resolveProjectAccess(
        null,
        'alice',
        'my-novel',
        {
          userId: 'owner-1',
          username: 'alice',
        },
        fakeDeps
      );
      expect(result).toEqual({
        ok: true,
        access: { canWrite: true, projectDbId: null, role: null },
      });
    });

    it('denies a non-owner username', async () => {
      const result = await resolveProjectAccess(
        null,
        'alice',
        'my-novel',
        {
          userId: 'owner-1',
          username: 'mallory',
        },
        fakeDeps
      );
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });
  });
});

describe('resolveProjectAccess — account state and session revocation', () => {
  const db = {} as never;
  const forbidden = { ok: false, reason: 'forbidden' };

  it('denies a disabled account even when it owns the project', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'disabled-1', username: 'alice' },
      {
        ...fakeDeps,
        findByUsernameAndSlug: async () => ({ id: 'p', userId: 'disabled-1' }) as never,
      }
    );
    expect(result).toEqual(forbidden);
  });

  it('denies an unapproved account', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'unapproved-1', username: 'bob' },
      fakeDeps
    );
    expect(result).toEqual(forbidden);
  });

  it("denies a token issued before the user's revocation watermark", async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'reset-1', username: 'bob', iat: 999_999 },
      fakeDeps
    );
    expect(result).toEqual(forbidden);
  });

  it('treats a token without iat as issued at 0 once the user has been bumped', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'reset-1', username: 'bob' },
      fakeDeps
    );
    expect(result).toEqual(forbidden);
  });

  it('allows a token issued at or after the watermark', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'reset-1', username: 'bob', iat: 1_000_000 },
      {
        ...fakeDeps,
        checkAccess: async () => ({
          isOwner: false,
          isCollaborator: true,
          role: 'viewer',
          canRead: true,
          canWrite: false,
          canAdmin: false,
        }),
      }
    );
    expect(result).toEqual({
      ok: true,
      access: { canWrite: false, projectDbId: 'project-1', role: 'viewer' },
    });
  });

  it('denies a token whose user row no longer exists', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'my-novel',
      { userId: 'ghost-1', username: 'gone' },
      fakeDeps
    );
    expect(result).toEqual(forbidden);
  });

  it('still reports project-not-found before consulting the user row', async () => {
    const result = await resolveProjectAccess(
      db,
      'alice',
      'missing',
      { userId: 'disabled-1', username: 'alice' },
      fakeDeps
    );
    expect(result).toEqual({ ok: false, reason: 'project-not-found' });
  });
});

describe("isActiveSiteAdmin — who may wipe another user's project DO", () => {
  const db = {} as never;
  const ADMIN = { enabled: true, approved: true, isAdmin: true, sessionsValidFrom: 0 };
  const rows: Record<string, typeof ADMIN> = {
    'admin-1': ADMIN,
    'member-1': { ...ADMIN, isAdmin: false },
    'disabled-admin': { ...ADMIN, enabled: false },
    'unapproved-admin': { ...ADMIN, approved: false },
    'reset-admin': { ...ADMIN, sessionsValidFrom: 1_000_000 },
  };
  const find = async (_db: never, userId: string) => rows[userId];
  const check = (userId: string | undefined, iat = 500_000) =>
    isActiveSiteAdmin(db, { userId, username: 'x', iat }, find);

  it('admits an active admin', async () => {
    expect(await check('admin-1')).toBe(true);
  });

  it('refuses non-admins, inactive admins, revoked tokens and unknown users', async () => {
    expect(await check('member-1')).toBe(false);
    expect(await check('disabled-admin')).toBe(false);
    expect(await check('unapproved-admin')).toBe(false);
    expect(await check('reset-admin')).toBe(false);
    expect(await check('ghost')).toBe(false);
    expect(await check(undefined)).toBe(false);
  });

  it('refuses without a database binding', async () => {
    expect(await isActiveSiteAdmin(null, { userId: 'admin-1', username: 'x' }, find)).toBe(false);
  });
});
