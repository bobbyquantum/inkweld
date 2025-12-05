import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { publishedFiles, projects, users } from '../db/schema';
import { getStorageService } from '../services/storage.service';
import { PublishedFileErrorSchema } from '../schemas/published-file.schemas';
import type { AppContext } from '../types/context';

const shareRoutes = new OpenAPIHono<AppContext>();

// NOTE: These routes are PUBLIC - no auth required

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

  // Find file by share token
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(eq(publishedFiles.shareToken, shareToken));

  if (!file) {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

  // Verify sharing is allowed
  if (file.sharePermission !== 'link' && file.sharePermission !== 'public') {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

  // Get project info to build storage path
  const [project] = await db.select().from(projects).where(eq(projects.id, file.projectId));

  if (!project) {
    return c.json({ error: 'File not found' }, 404);
  }

  // Get owner username
  const [owner] = await db.select().from(users).where(eq(users.id, project.userId));

  if (!owner || !owner.username) {
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
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.size),
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

  // Find file by share token
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(eq(publishedFiles.shareToken, shareToken));

  if (!file) {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

  // Verify sharing is allowed
  if (file.sharePermission !== 'link' && file.sharePermission !== 'public') {
    return c.json({ error: 'File not found or sharing not enabled' }, 404);
  }

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
