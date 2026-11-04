import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { projects, users } from '../db/schema';
import { projectService } from '../services/project.service';
import { findSharedFile } from '../services/share.service';
import { getStorageService } from '../services/storage.service';
import { PublishedFileErrorSchema } from '../schemas/published-file.schemas';
import type { AppContext } from '../types/context';
import { robotsTagFor } from '../utils/share-page';
import { contentDisposition } from '../utils/content-disposition';

const shareRoutes = new OpenAPIHono<AppContext>();

// NOTE: These routes are PUBLIC - no auth required

const getPublicProjectRoute = createRoute({
  method: 'get',
  path: '/projects/:username/:slug',
  operationId: 'getPublicProject',
  tags: ['Share'],
  request: {
    params: z.object({
      username: z.string(),
      slug: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            username: z.string(),
            slug: z.string(),
            title: z.string(),
            description: z.string().nullable(),
            coverImage: z.string().nullable(),
          }),
        },
      },
      description: 'Public project landing page information',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Project not found or public sharing is disabled',
    },
  },
});

shareRoutes.openapi(getPublicProjectRoute, async (c) => {
  const { username, slug } = c.req.param();
  const project = await projectService.findByUsernameAndSlug(c.get('db'), username, slug);

  c.header('Cache-Control', 'no-store');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (!project?.isPublic) {
    return c.json({ error: 'Project not found or public sharing is disabled' }, 404);
  }

  return c.json(
    {
      username: project.username,
      slug: project.slug,
      title: project.title,
      description: project.description,
      coverImage: project.coverImage,
    },
    200
  );
});

// ============================================
// ACCESS SHARED FILE (PUBLIC)
// ============================================
const getSharedFileRoute = createRoute({
  method: 'get',
  path: '/:shareToken',
  operationId: 'getSharedFile',
  tags: ['Share'],
  request: {
    params: z.object({
      shareToken: z.string().openapi({ example: 'abc123xyz', description: 'Share token' }),
    }),
  },
  responses: {
    200: {
      content: { '*/*': { schema: z.any().openapi({ type: 'string', format: 'binary' }) } },
      description: 'File content',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found or sharing not enabled',
    },
  },
});

shareRoutes.openapi(getSharedFileRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const { shareToken } = c.req.param();

  const file = await findSharedFile(db, shareToken);
  if (!file) {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

  // Get project info to build storage path
  const [project] = await db.select().from(projects).where(eq(projects.id, file.projectId));

  if (!project) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Get owner username
  const [owner] = await db.select().from(users).where(eq(users.id, project.userId));

  if (!owner?.username) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Get file content from storage
  const content = await storage.readProjectFile(
    owner.username,
    project.slug,
    `published/${file.id}`
  );

  if (!content) {
    return c.json({ error: 'File content not found' }, 404);
  }

  return new Response(content, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': contentDisposition('attachment', file.filename),
      'Content-Length': String(file.size),
      'X-Robots-Tag': robotsTagFor(file.sharePermission),
    },
  });
});

// ============================================
// GET SHARED FILE METADATA (PUBLIC)
// ============================================
const getSharedFileInfoRoute = createRoute({
  method: 'get',
  path: '/:shareToken/info',
  operationId: 'getSharedFileInfo',
  tags: ['Share'],
  request: {
    params: z.object({
      shareToken: z.string().openapi({ example: 'abc123xyz', description: 'Share token' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            filename: z.string(),
            format: z.string(),
            size: z.number(),
            title: z.string(),
            author: z.string(),
            createdAt: z.string(),
          }),
        },
      },
      description: 'File metadata',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found or sharing not enabled',
    },
  },
});

shareRoutes.openapi(getSharedFileInfoRoute, async (c) => {
  const db = c.get('db');
  const { shareToken } = c.req.param();

  const file = await findSharedFile(db, shareToken);
  if (!file) {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

  c.header('X-Robots-Tag', robotsTagFor(file.sharePermission));
  return c.json(
    {
      filename: file.filename,
      format: file.format,
      size: file.size,
      title: file.metaTitle,
      author: file.metaAuthor,
      createdAt: new Date(file.createdAt).toISOString(),
    },
    200
  );
});

export { shareRoutes };
