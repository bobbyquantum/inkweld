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
import { userService } from '../services/user.service';
import { isSessionRevoked } from './session-validity';

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
  /** The user row behind the token, for enabled/approved + revocation checks. */
  findUserById(
    db: D1DatabaseInstance,
    userId: string
  ): Promise<{ enabled: boolean; approved: boolean; sessionsValidFrom: number } | undefined>;
}

const defaultDeps: ProjectAccessDeps = {
  findByUsernameAndSlug: (db, username, slug) =>
    projectService.findByUsernameAndSlug(db, username, slug),
  checkAccess: (db, projectId, userId) => collaborationService.checkAccess(db, projectId, userId),
  findUserById: (db, userId) => userService.findById(db, userId),
};

export interface ProjectAccessResolution {
  canWrite: boolean;
  projectDbId: string | null;
  /** Collaboration role ('editor' | 'commenter' | 'viewer'), or null for the owner. */
  role: string | null;
}

export type ProjectAccessDenialReason = 'project-not-found' | 'forbidden';

/** The subset of JWT claims the access check needs. */
export interface SessionClaims {
  userId?: string;
  sub?: string;
  username: string;
  /** Issued-at (unix seconds); compared against users.sessionsValidFrom. */
  iat?: number;
}

export type ProjectAccessResult =
  { ok: true; access: ProjectAccessResolution } | { ok: false; reason: ProjectAccessDenialReason };

/**
 * Resolve a session's access to a project by owner + slug.
 *
 * Owner check via `project.userId`, then a collaboration lookup so
 * editors/commenters/viewers are honoured.
 *
 * Returns `{ ok: true, access }` on success or `{ ok: false, reason }` on
 * denial. The caller maps the result to its transport (WS messages or HTTP
 * responses).
 */
export async function resolveProjectAccess(
  db: D1DatabaseInstance,
  projectOwner: string,
  slug: string,
  session: SessionClaims,
  deps: ProjectAccessDeps = defaultDeps
): Promise<ProjectAccessResult> {
  const jwtUserId = session.userId ?? session.sub;

  const project = await deps.findByUsernameAndSlug(db, projectOwner, slug);
  if (!project) {
    return { ok: false, reason: 'project-not-found' };
  }

  // The HTTP middleware re-checks the user row on every request; the socket
  // paths only verified the JWT, so a disabled or unapproved account — or a
  // token revoked by a password reset — kept syncing for the token's 30-day
  // life. Load the row once here so both WS runtimes and the DO HTTP API
  // apply the same rule.
  if (!(await isSessionUserActive(db, session, deps))) {
    return { ok: false, reason: 'forbidden' };
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

/** Whether the user behind the token is enabled, approved and not revoked. */
async function isSessionUserActive(
  db: D1DatabaseInstance,
  session: SessionClaims,
  deps: ProjectAccessDeps
): Promise<boolean> {
  const jwtUserId = session.userId ?? session.sub;
  const user = jwtUserId ? await deps.findUserById(db, jwtUserId) : undefined;
  return !!user && user.enabled && user.approved && !isSessionRevoked(user, session);
}

/**
 * Where a rename stands in the database: `pending` while the project still
 * has its old slug, `committed` once the row carries the new one.
 */
export type ProjectRenamePhase = 'pending' | 'committed';

export type ProjectRenameAccessResult =
  | { ok: true; phase: ProjectRenamePhase }
  | { ok: false; reason: ProjectAccessDenialReason | 'conflict' };

/**
 * Authorize one step of moving a project's Durable Object from
 * `owner:fromSlug` to `owner:toSlug` (project rename on Workers).
 *
 * The steps run on both objects and on both sides of the database update, so
 * the project is looked up under either slug, and the result says which one
 * it currently has. Only someone who may rename the project (the owner or an
 * `admin` collaborator, as in the rename route) is admitted. When both slugs
 * name a project, `toSlug` belongs to a different project and nothing may be
 * moved into it or wiped.
 */
export async function resolveProjectRenameAccess(
  db: D1DatabaseInstance,
  projectOwner: string,
  fromSlug: string,
  toSlug: string,
  session: SessionClaims,
  deps: ProjectAccessDeps = defaultDeps
): Promise<ProjectRenameAccessResult> {
  const [atFrom, atTo] = await Promise.all([
    deps.findByUsernameAndSlug(db, projectOwner, fromSlug),
    deps.findByUsernameAndSlug(db, projectOwner, toSlug),
  ]);
  if (atFrom && atTo) return { ok: false, reason: 'conflict' };
  const project = atFrom ?? atTo;
  if (!project) return { ok: false, reason: 'project-not-found' };

  if (!(await isSessionUserActive(db, session, deps))) {
    return { ok: false, reason: 'forbidden' };
  }
  const jwtUserId = session.userId ?? session.sub;
  if (project.userId !== jwtUserId) {
    const access = await deps.checkAccess(db, project.id, jwtUserId);
    if (!access.canAdmin) return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, phase: atFrom ? 'pending' : 'committed' };
}

/**
 * Whether the session belongs to an active site administrator (enabled,
 * approved, admin, token not revoked). Used only to let an admin wipe a
 * project's Durable Object when deleting another user's account — the
 * project-level check above admits owners and collaborators, never admins.
 */
export async function isActiveSiteAdmin(
  db: D1DatabaseInstance | null,
  session: SessionClaims,
  findUserById: (
    db: D1DatabaseInstance,
    userId: string
  ) => Promise<
    { enabled: boolean; approved: boolean; isAdmin: boolean; sessionsValidFrom: number } | undefined
  > = (database, userId) => userService.findById(database, userId)
): Promise<boolean> {
  const userId = session.userId ?? session.sub;
  if (!db || !userId) return false;
  const user = await findUserById(db, userId);
  return (
    !!user && user.enabled && user.approved && user.isAdmin && !isSessionRevoked(user, session)
  );
}
