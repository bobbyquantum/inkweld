import type { MiddlewareHandler } from 'hono';
import { NotFoundError } from '../errors';
import { projectService } from '../services/project.service';
import type { AppContext } from '../types/context';
import { requireAuth } from './auth';

/**
 * Allow anonymous GETs only for explicitly public project content. Callers must
 * opt in per read-only route; every mutation still runs normal authentication.
 * The marker deliberately grants no user identity or administrative permission.
 */
/** Routers whose paths start with a project's `:username/:slug`. */
const PROJECT_PATH_PREFIXES = [
  '/api/v1/projects/',
  '/api/v1/media/',
  '/api/v1/published-files/',
  '/api/v1/comments/',
  '/api/v1/activity/projects/',
];

/**
 * Split `<prefix><username>/<slug><rest>` into `[path, username, slug, rest]`
 * (still URL-encoded), or null when the path names no project. Plain string
 * parsing rather than a regex, so no input can make it backtrack.
 */
export function matchProjectPath(path: string): [string, string, string, string] | null {
  const prefix = PROJECT_PATH_PREFIXES.find((candidate) => path.startsWith(candidate));
  if (!prefix) return null;
  const tail = path.slice(prefix.length);
  const usernameEnd = tail.indexOf('/');
  if (usernameEnd <= 0) return null;
  const nextSlash = tail.indexOf('/', usernameEnd + 1);
  const slugEnd = nextSlash === -1 ? tail.length : nextSlash;
  if (slugEnd === usernameEnd + 1) return null;
  return [
    path,
    tail.slice(0, usernameEnd),
    tail.slice(usernameEnd + 1, slugEnd),
    tail.slice(slugEnd),
  ];
}

export const requireProjectReadAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const match = matchProjectPath(c.req.path);
  const publicRequest = c.req.header('X-Inkweld-Public-View') === 'true';
  const publicCover = match?.[3] === '/cover';
  const personalCommentState =
    c.req.path.startsWith('/api/v1/comments/') && match?.[3] === '/unread';
  if (
    c.req.method !== 'GET' ||
    !match ||
    personalCommentState ||
    (!publicRequest && !publicCover)
  ) {
    return requireAuth(c, next);
  }
  // The projects router is mounted before other routers on this prefix.
  const publicPublishedFile = /^\/published(?:\/[^/]+)?$/.test(match[3]);
  if (
    c.req.path.startsWith('/api/v1/projects/') &&
    match[3] &&
    !publicCover &&
    !publicPublishedFile
  ) {
    return requireAuth(c, next);
  }
  const project = await projectService.findByUsernameAndSlug(
    c.get('db'),
    decodeURIComponent(match[1]),
    decodeURIComponent(match[2])
  );
  if (!project?.isPublic) {
    if (publicCover && !publicRequest && c.req.header('Authorization')) {
      return requireAuth(c, next);
    }
    throw new NotFoundError('Project not found');
  }
  // Comments and the activity feed are shared only when the owner says so
  if (
    (c.req.path.startsWith('/api/v1/comments/') && !project.publicComments) ||
    (c.req.path.startsWith('/api/v1/activity/projects/') && !project.publicActivity)
  ) {
    throw new NotFoundError('Not found');
  }
  c.set('publicProjectRead', true);
  c.header('Cache-Control', 'no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  return next();
};
