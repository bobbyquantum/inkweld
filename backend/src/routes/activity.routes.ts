/**
 * Activity Routes
 *
 * Read-only endpoints surfacing recent project activity events.
 *
 * Endpoints:
 *   GET /api/v1/activity/projects/:username/:slug
 *     -> Recent events scoped to a single project.
 *   GET /api/v1/activity/me
 *     -> Recent events across every project the user owns or collaborates on,
 *        used to populate the home dashboard "what's new" widget.
 *
 * Both endpoints support cursor pagination via `?before=<ms-timestamp>` and
 * a `?limit=` (default 50, max 100). Events are returned newest-first and
 * are enriched with the actor's username and (for the cross-project
 * variant) the project's display title so the frontend can render a
 * fully-formed feed without N+1 lookups.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { activityService } from '../services/activity.service';
import { userService } from '../services/user.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import { type AppContext } from '../types/context';

const activityRoutes = new OpenAPIHono<AppContext>();

activityRoutes.use('*', requireAuth);

function parseLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 50;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 100);
}

function parseBefore(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

activityRoutes.get('/projects/:username/:slug', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const { username, slug } = c.req.param();
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) throw new NotFoundError('Project not found');

  if (project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canRead) throw new ForbiddenError();
  }

  const limit = parseLimit(c.req.query('limit'));
  const before = parseBefore(c.req.query('before'));
  const events = await activityService.listForProject(db, project.id, limit, before);

  // Resolve actor usernames in one batch (de-duped).
  const userIds = Array.from(new Set(events.map((e) => e.userId)));
  const userMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      const u = await userService.findById(db, uid).catch(() => null);
      if (u?.username) userMap.set(uid, u.username);
    })
  );

  return c.json({
    events: events.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      userId: e.userId,
      username: userMap.get(e.userId) ?? null,
      eventType: e.eventType,
      entityId: e.entityId,
      entityName: e.entityName,
      metadata: e.metadata,
      createdAt: e.createdAt,
    })),
    nextBefore: events.length === limit ? events[events.length - 1].createdAt : null,
  });
});

activityRoutes.get('/me', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  const [owned, collaborated] = await Promise.all([
    projectService.findByUserId(db, user.id),
    collaborationService.getCollaboratedProjects(db, user.id),
  ]);
  const projectInfo = new Map<
    string,
    { id: string; slug: string; title: string; ownerUsername: string }
  >();
  for (const p of owned) {
    if (!projectInfo.has(p.id)) {
      projectInfo.set(p.id, {
        id: p.id,
        slug: p.slug,
        title: p.title,
        ownerUsername: p.username,
      });
    }
  }
  for (const p of collaborated) {
    if (!projectInfo.has(p.projectId)) {
      projectInfo.set(p.projectId, {
        id: p.projectId,
        slug: p.projectSlug,
        title: p.projectTitle,
        ownerUsername: p.ownerUsername,
      });
    }
  }
  const projectIds = Array.from(projectInfo.keys());

  const limit = parseLimit(c.req.query('limit'));
  const before = parseBefore(c.req.query('before'));
  const events = await activityService.listForProjects(db, projectIds, limit, before);

  const userIds = Array.from(new Set(events.map((e) => e.userId)));
  const userMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      const u = await userService.findById(db, uid).catch(() => null);
      if (u?.username) userMap.set(uid, u.username);
    })
  );

  return c.json({
    events: events.map((e) => {
      const proj = projectInfo.get(e.projectId);
      return {
        id: e.id,
        projectId: e.projectId,
        projectSlug: proj?.slug ?? null,
        projectTitle: proj?.title ?? null,
        projectOwnerUsername: proj?.ownerUsername ?? null,
        userId: e.userId,
        username: userMap.get(e.userId) ?? null,
        eventType: e.eventType,
        entityId: e.entityId,
        entityName: e.entityName,
        metadata: e.metadata,
        createdAt: e.createdAt,
      };
    }),
    nextBefore: events.length === limit ? events[events.length - 1].createdAt : null,
  });
});

export default activityRoutes;
