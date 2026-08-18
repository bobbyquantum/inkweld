/**
 * Unit tests for resolveProjectAccess — the shared project-access resolver
 * used by BOTH the WebSocket auth path and the DO HTTP API.
 *
 * Regression for the cross-tenant IDOR: the DO HTTP API previously verified
 * only the JWT and never checked project membership, so any authenticated
 * user could read/mutate any project's documents via
 * GET/POST /api/v1/ws/yjs/do/:endpoint?documentId=user:slug:...
 */
import { describe, it, expect, mock } from 'bun:test';
import { resolveProjectAccess } from '../src/utils/project-access';

// Stub the services the resolver delegates to so the test stays a pure
// unit test (no DB, no server). `mock.module` applies to imports resolved
// after this call.
mock.module('../src/services/project.service', () => ({
  projectService: {
    findByUsernameAndSlug: async (_db: unknown, username: string, slug: string) => {
      if (username === 'missing' || slug === 'missing') return undefined;
      return {
        id: 'project-1',
        userId: 'owner-1',
        slug,
        username,
        title: 'Test Project',
      };
    },
  },
}));

mock.module('../src/services/collaboration.service', () => ({
  collaborationService: {
    checkAccess: async (_db: unknown, _projectId: string, userId: string | null | undefined) => {
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
  },
}));

describe('resolveProjectAccess', () => {
  const db = {} as never;

  it('allows the owner (userId claim) full write access', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      userId: 'owner-1',
      username: 'alice',
    });
    expect(result).toEqual({
      ok: true,
      access: { canWrite: true, projectDbId: 'project-1', role: null },
    });
  });

  it('allows the owner via the OAuth sub claim', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      sub: 'owner-1',
      username: 'alice',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.access.canWrite).toBe(true);
    }
  });

  it('allows an editor collaborator with write access', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      userId: 'editor-1',
      username: 'bob',
    });
    expect(result).toEqual({
      ok: true,
      access: { canWrite: true, projectDbId: 'project-1', role: 'editor' },
    });
  });

  it('allows a viewer collaborator with read-only access', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      userId: 'viewer-1',
      username: 'carol',
    });
    expect(result).toEqual({
      ok: true,
      access: { canWrite: false, projectDbId: 'project-1', role: 'viewer' },
    });
  });

  it('denies a non-collaborator with forbidden', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      userId: 'stranger-1',
      username: 'mallory',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('denies with project-not-found when the project does not exist', async () => {
    const result = await resolveProjectAccess(db, 'missing', 'missing', {
      userId: 'owner-1',
      username: 'alice',
    });
    expect(result).toEqual({ ok: false, reason: 'project-not-found' });
  });

  it('denies a user with no userId/sub claim', async () => {
    const result = await resolveProjectAccess(db, 'alice', 'my-novel', {
      username: 'ghost',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  describe('legacy no-D1 mode', () => {
    it('allows the owner (username match)', async () => {
      const result = await resolveProjectAccess(null, 'alice', 'my-novel', {
        userId: 'owner-1',
        username: 'alice',
      });
      expect(result).toEqual({
        ok: true,
        access: { canWrite: true, projectDbId: null, role: null },
      });
    });

    it('denies a non-owner username', async () => {
      const result = await resolveProjectAccess(null, 'alice', 'my-novel', {
        userId: 'owner-1',
        username: 'mallory',
      });
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    });
  });
});
