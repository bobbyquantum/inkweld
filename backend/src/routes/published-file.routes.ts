import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from '../errors';

import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { getStorageService } from '../services/storage.service';
import { publishedFiles, type SharePermission } from '../db/schema';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';
import {
  PublishedFileSchema,
  CreatePublishedFileRequestSchema,
  UpdatePublishedFileRequestSchema,
  ShareLinkResponseSchema,
  PublishedFileErrorSchema,
  PublishedFileIdParamSchema,
} from '../schemas/published-file.schemas';
import type { AppContext } from '../types/context';

const publishedFileRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all routes (except share endpoint which is public)
publishedFileRoutes.use('*', requireAuth);

// Combined path params schema
const ProjectFilePathParamsSchema = ProjectPathParamsSchema.merge(PublishedFileIdParamSchema);

// ============================================
// LIST PUBLISHED FILES
// ============================================
const listPublishedFilesRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/published',
  operationId: 'listPublishedFiles',
  tags: ['Published Files'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(PublishedFileSchema) } },
      description: 'List of published files',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Project not found',
    },
  },
});

publishedFileRoutes.openapi(listPublishedFilesRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug } = c.req.param();

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // For now, only owner can see published files
  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  const files = await db
    .select()
    .from(publishedFiles)
    .where(eq(publishedFiles.projectId, project.id))
    .orderBy(desc(publishedFiles.createdAt));

  return c.json(
    files.map((f) => ({
      id: f.id,
      projectId: f.projectId,
      filename: f.filename,
      format: f.format,
      mimeType: f.mimeType,
      size: f.size,
      planName: f.planName,
      sharePermission: f.sharePermission as SharePermission,
      shareToken: f.shareToken,
      createdAt: new Date(f.createdAt).toISOString(),
      updatedAt: new Date(f.updatedAt).toISOString(),
      metadata: {
        title: f.metaTitle,
        author: f.metaAuthor,
        subtitle: f.metaSubtitle,
        language: f.metaLanguage,
        itemCount: f.metaItemCount,
        wordCount: f.metaWordCount,
      },
    })),
    200
  );
});

// ============================================
// CREATE PUBLISHED FILE (UPLOAD)
// ============================================
const createPublishedFileRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/published',
  operationId: 'createPublishedFile',
  tags: ['Published Files'],
  request: {
    params: ProjectPathParamsSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z
              .any()
              .openapi({ type: 'string', format: 'binary', description: 'The published file' }),
            metadata: z.string().openapi({ description: 'JSON metadata string' }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: PublishedFileSchema } },
      description: 'Published file created',
    },
    400: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Invalid request',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Project not found',
    },
  },
});

publishedFileRoutes.openapi(createPublishedFileRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storage = getStorageService(c.get('storage'));
  const { username, slug } = c.req.param();

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const metadataStr = formData.get('metadata') as string | null;

  if (!file) {
    return c.json({ error: 'File is required' }, 400);
  }

  if (!metadataStr) {
    return c.json({ error: 'Metadata is required' }, 400);
  }

  let metadata: z.infer<typeof CreatePublishedFileRequestSchema>;
  try {
    metadata = CreatePublishedFileRequestSchema.parse(JSON.parse(metadataStr));
  } catch {
    return c.json({ error: 'Invalid metadata format' }, 400);
  }

  const now = Date.now();
  const fileId = crypto.randomUUID();

  // Generate share token if permission allows sharing
  const shareToken =
    metadata.sharePermission === 'link' || metadata.sharePermission === 'public'
      ? nanoid(16)
      : null;

  // Store the file blob in published subdirectory
  const storageFilename = `published/${fileId}`;
  const arrayBuffer = await file.arrayBuffer();
  await storage.saveProjectFile(
    username,
    slug,
    storageFilename,
    new Uint8Array(arrayBuffer),
    metadata.mimeType
  );

  // Create database record
  const [newFile] = await db
    .insert(publishedFiles)
    .values({
      id: fileId,
      projectId: project.id,
      filename: metadata.filename,
      format: metadata.format,
      mimeType: metadata.mimeType,
      size: file.size,
      planName: metadata.planName,
      sharePermission: metadata.sharePermission || 'private',
      shareToken,
      metaTitle: metadata.metadata.title,
      metaAuthor: metadata.metadata.author,
      metaSubtitle: metadata.metadata.subtitle,
      metaLanguage: metadata.metadata.language,
      metaItemCount: metadata.metadata.itemCount,
      metaWordCount: metadata.metadata.wordCount,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return c.json(
    {
      id: newFile.id,
      projectId: newFile.projectId,
      filename: newFile.filename,
      format: newFile.format,
      mimeType: newFile.mimeType,
      size: newFile.size,
      planName: newFile.planName,
      sharePermission: newFile.sharePermission as SharePermission,
      shareToken: newFile.shareToken,
      createdAt: new Date(newFile.createdAt).toISOString(),
      updatedAt: new Date(newFile.updatedAt).toISOString(),
      metadata: {
        title: newFile.metaTitle,
        author: newFile.metaAuthor,
        subtitle: newFile.metaSubtitle,
        language: newFile.metaLanguage,
        itemCount: newFile.metaItemCount,
        wordCount: newFile.metaWordCount,
      },
    },
    201
  );
});

// ============================================
// GET PUBLISHED FILE (DOWNLOAD)
// ============================================
const getPublishedFileRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/published/:fileId',
  operationId: 'getPublishedFile',
  tags: ['Published Files'],
  request: {
    params: ProjectFilePathParamsSchema,
  },
  responses: {
    200: {
      content: { '*/*': { schema: z.any().openapi({ type: 'string', format: 'binary' }) } },
      description: 'File content',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found',
    },
  },
});

publishedFileRoutes.openapi(getPublishedFileRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storage = getStorageService(c.get('storage'));
  const { username, slug, fileId } = c.req.param();

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  // Get file metadata
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(and(eq(publishedFiles.id, fileId), eq(publishedFiles.projectId, project.id)));

  if (!file) {
    throw new NotFoundError('File not found');
  }

  // Get file content from storage
  const content = await storage.readProjectFile(username, slug, `published/${fileId}`);

  if (!content) {
    throw new NotFoundError('File content not found');
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
// UPDATE PUBLISHED FILE (PERMISSIONS/RENAME)
// ============================================
const updatePublishedFileRoute = createRoute({
  method: 'patch',
  path: '/:username/:slug/published/:fileId',
  operationId: 'updatePublishedFile',
  tags: ['Published Files'],
  request: {
    params: ProjectFilePathParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdatePublishedFileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PublishedFileSchema } },
      description: 'Updated published file',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found',
    },
  },
});

publishedFileRoutes.openapi(updatePublishedFileRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug, fileId } = c.req.param();
  const body = c.req.valid('json');

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  // Get existing file
  const [existingFile] = await db
    .select()
    .from(publishedFiles)
    .where(and(eq(publishedFiles.id, fileId), eq(publishedFiles.projectId, project.id)));

  if (!existingFile) {
    throw new NotFoundError('File not found');
  }

  // Build update values
  const updates: Partial<typeof existingFile> = {
    updatedAt: Date.now(),
  };

  if (body.filename) {
    updates.filename = body.filename;
  }

  if (body.sharePermission) {
    updates.sharePermission = body.sharePermission;

    // Generate or clear share token based on permission
    if (body.sharePermission === 'link' || body.sharePermission === 'public') {
      if (!existingFile.shareToken) {
        updates.shareToken = nanoid(16);
      }
    } else {
      updates.shareToken = null;
    }
  }

  // Perform update
  const [updatedFile] = await db
    .update(publishedFiles)
    .set(updates)
    .where(eq(publishedFiles.id, fileId))
    .returning();

  return c.json(
    {
      id: updatedFile.id,
      projectId: updatedFile.projectId,
      filename: updatedFile.filename,
      format: updatedFile.format,
      mimeType: updatedFile.mimeType,
      size: updatedFile.size,
      planName: updatedFile.planName,
      sharePermission: updatedFile.sharePermission as SharePermission,
      shareToken: updatedFile.shareToken,
      createdAt: new Date(updatedFile.createdAt).toISOString(),
      updatedAt: new Date(updatedFile.updatedAt).toISOString(),
      metadata: {
        title: updatedFile.metaTitle,
        author: updatedFile.metaAuthor,
        subtitle: updatedFile.metaSubtitle,
        language: updatedFile.metaLanguage,
        itemCount: updatedFile.metaItemCount,
        wordCount: updatedFile.metaWordCount,
      },
    },
    200
  );
});

// ============================================
// DELETE PUBLISHED FILE
// ============================================
const deletePublishedFileRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/published/:fileId',
  operationId: 'deletePublishedFile',
  tags: ['Published Files'],
  request: {
    params: ProjectFilePathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ message: z.string() }),
        },
      },
      description: 'File deleted',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found',
    },
  },
});

publishedFileRoutes.openapi(deletePublishedFileRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const storage = getStorageService(c.get('storage'));
  const { username, slug, fileId } = c.req.param();

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  // Get file to verify it exists
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(and(eq(publishedFiles.id, fileId), eq(publishedFiles.projectId, project.id)));

  if (!file) {
    throw new NotFoundError('File not found');
  }

  // Delete from storage
  await storage.deleteProjectFile(username, slug, `published/${fileId}`);

  // Delete from database
  await db.delete(publishedFiles).where(eq(publishedFiles.id, fileId));

  return c.json({ message: 'File deleted successfully' }, 200);
});

// ============================================
// GET SHARE LINK
// ============================================
const getShareLinkRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/published/:fileId/share-link',
  operationId: 'getPublishedFileShareLink',
  tags: ['Published Files'],
  request: {
    params: ProjectFilePathParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ShareLinkResponseSchema } },
      description: 'Share link info',
    },
    400: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Sharing not enabled',
    },
    401: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: PublishedFileErrorSchema } },
      description: 'File not found',
    },
  },
});

publishedFileRoutes.openapi(getShareLinkRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug, fileId } = c.req.param();

  if (!user) {
    throw new UnauthorizedError();
  }

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== user.id) {
    throw new ForbiddenError();
  }

  // Get file
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(and(eq(publishedFiles.id, fileId), eq(publishedFiles.projectId, project.id)));

  if (!file) {
    throw new NotFoundError('File not found');
  }

  if (!file.shareToken) {
    throw new BadRequestError('Sharing is not enabled for this file');
  }

  // Build share URL (base URL would come from config in production)
  const baseUrl = c.req.header('origin') || 'https://inkweld.app';
  const shareUrl = `${baseUrl}/share/${file.shareToken}`;

  return c.json(
    {
      shareToken: file.shareToken,
      shareUrl,
    },
    200
  );
});

export { publishedFileRoutes };
