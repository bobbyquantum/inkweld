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
export const requireProjectReadAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const match =
    /^\/api\/v1\/(?:projects|media|published-files|comments|activity\/projects)\/([^/]+)\/([^/]+)(.*)$/.exec(
      c.req.path
    );
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
  c.set('publicProjectRead', true);
  c.header('Cache-Control', 'no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  return next();
};
