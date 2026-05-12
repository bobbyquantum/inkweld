/**
 * Stats Routes
 *
 * Read-only endpoints surfacing per-project and cross-project writing
 * statistics derived from the `writing_sessions` table.
 *
 * Endpoints:
 *   GET /api/v1/stats/projects/:username/:slug
 *     -> Per-project summary: totals, daily series, contributor breakdown.
 *   GET /api/v1/stats/me
 *     -> Cross-project summary for the authenticated user across all
 *        projects they own or collaborate on.
 *
 * The window is controlled by `?days=N` (default 30, max 365).
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { writingSessionService } from '../services/writing-session.service';
import { userService } from '../services/user.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import { type AppContext } from '../types/context';

const statsRoutes = new OpenAPIHono<AppContext>();

statsRoutes.use('*', requireAuth);

/** Parse and clamp the `?days=` query param. */
function parseDays(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(n, 365);
}

statsRoutes.get('/projects/:username/:slug', async (c) => {
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

  const days = parseDays(c.req.query('days'));
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const [daily, contributors, totalWords] = await Promise.all([
    writingSessionService.dailyWordsForProject(db, project.id, sinceMs),
    writingSessionService.contributorTotalsForProject(db, project.id, sinceMs),
    writingSessionService.totalWordsForProject(db, project.id, sinceMs),
  ]);

  // Resolve contributor usernames for display. Best-effort — unknown users
  // simply fall through with their id as the label.
  const userIds = contributors.map((c) => c.userId);
  const userMap = new Map<string, string>();
  await Promise.all(
    userIds.map(async (uid) => {
      const u = await userService.findById(db, uid).catch(() => null);
      if (u?.username) userMap.set(uid, u.username);
    })
  );

  return c.json({
    projectId: project.id,
    windowDays: days,
    totalWords,
    daily,
    contributors: contributors.map((c) => ({
      userId: c.userId,
      username: userMap.get(c.userId) ?? null,
      words: c.words,
    })),
  });
});

statsRoutes.get('/me', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user) throw new UnauthorizedError();

  // Build the set of project ids the user can see (owned + collaborated).
  const [owned, collaborated] = await Promise.all([
    projectService.findByUserId(db, user.id),
    collaborationService.getCollaboratedProjects(db, user.id),
  ]);
  const projectIds = Array.from(
    new Set<string>([...owned.map((p) => p.id), ...collaborated.map((p) => p.projectId)])
  );

  const days = parseDays(c.req.query('days'));
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const daily = await writingSessionService.dailyWordsForProjects(db, projectIds, sinceMs);
  const totalWords = daily.reduce((acc, d) => acc + d.words, 0);

  return c.json({
    windowDays: days,
    projectCount: projectIds.length,
    totalWords,
    daily,
  });
});

export default statsRoutes;
