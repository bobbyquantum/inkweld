/**
 * Shared project-access resolution for Yjs collaboration.
 *
 * Kept in `src/utils` (not `src/durable-objects`) so it is unit-testable in
 * the Bun runtime and included in Sonar analysis/coverage — the Durable
 * Object class itself can't be imported in Bun because it pulls in
 * `cloudflare:workers`, and `durable-objects/**` is excluded from Sonar.
 *
 * This is the single source of truth for "may this user access this
 * project" used by BOTH the WebSocket auth path and the DO HTTP API, so the
 * two transports can never drift apart again (the HTTP API previously only
 * verified the JWT and never checked project membership — a cross-tenant
 * IDOR reachable by any authenticated user).
 */

import type { D1DatabaseInstance } from '../db/d1';
import type { Project } from '../db/schema/projects';
import type { ProjectAccess } from '../services/collaboration.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';

/**
 * The data lookups `resolveProjectAccess` needs, injected so the resolver can
 * be unit-tested in Bun without `mock.module`. `mock.module` mocks the module
 * for the ENTIRE `bun test` process, so any test that used it would corrupt
 * every other test file importing these services (project / collaboration).
 * Injecting the dependencies keeps the test isolated and side-effect-free.
 */
export interface ProjectAccessDeps {
  findByUsernameAndSlug(
    db: D1DatabaseInstance,
    username: string,
    slug: string
  ): Promise<(Project & { username: string }) | undefined>;
  checkAccess(
    db: D1DatabaseInstance,
    projectId: string,
    userId: string | null | undefined
  ): Promise<ProjectAccess>;
}

const defaultDeps: ProjectAccessDeps = {
  findByUsernameAndSlug: (db, username, slug) =>
    projectService.findByUsernameAndSlug(db, username, slug),
  checkAccess: (db, projectId, userId) => collaborationService.checkAccess(db, projectId, userId),
};

export interface ProjectAccessResolution {
  canWrite: boolean;
  projectDbId: string | null;
  /** Collaboration role ('editor' | 'commenter' | 'viewer'), or null for the owner / legacy mode. */
  role: string | null;
}

export type ProjectAccessDenialReason = 'project-not-found' | 'forbidden';

/** The subset of JWT claims the access check needs. */
export interface SessionClaims {
  userId?: string;
  sub?: string;
  username: string;
}

export type ProjectAccessResult =
  { ok: true; access: ProjectAccessResolution } | { ok: false; reason: ProjectAccessDenialReason };

/**
 * Resolve a session's access to a project by owner + slug.
 *
 * - With a D1 binding: owner check via `project.userId`, then a real
 *   collaboration lookup so editors/commenters/viewers are honoured.
 * - Without a D1 binding (legacy deployments): owner-only check, matching
 *   the historical WS behaviour.
 *
 * Returns `{ ok: true, access }` on success or `{ ok: false, reason }` on
 * denial. The caller maps the result to its transport (WS messages or HTTP
 * responses).
 */
export async function resolveProjectAccess(
  db: D1DatabaseInstance | null,
  projectOwner: string,
  slug: string,
  session: SessionClaims,
  deps: ProjectAccessDeps = defaultDeps
): Promise<ProjectAccessResult> {
  const jwtUserId = session.userId ?? session.sub;

  // Legacy owner-only check for deployments without a D1 binding.
  if (!db) {
    if (session.username !== projectOwner) {
      return { ok: false, reason: 'forbidden' };
    }
    return { ok: true, access: { canWrite: true, projectDbId: null, role: null } };
  }

  const project = await deps.findByUsernameAndSlug(db, projectOwner, slug);
  if (!project) {
    return { ok: false, reason: 'project-not-found' };
  }

  if (project.userId === jwtUserId) {
    return { ok: true, access: { canWrite: true, projectDbId: project.id, role: null } };
  }

  const access = await deps.checkAccess(db, project.id, jwtUserId);
  if (!access.canRead) {
    return { ok: false, reason: 'forbidden' };
  }

  return {
    ok: true,
    access: { canWrite: access.canWrite, projectDbId: project.id, role: access.role },
  };
}
