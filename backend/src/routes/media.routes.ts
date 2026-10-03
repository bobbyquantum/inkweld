import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { lookup } from 'mime-types';
import { requireAuth } from '../middleware/auth';
import {
  MAX_MEDIA_UPLOAD_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  sanitizeUploadFilename,
} from '../utils/upload';
import { getStorageService } from '../services/storage.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { quotaService } from '../services/quota.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { quotaStorageContext, storedProjectFileSize } from '../utils/quota-context';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema, QuotaExceededSchema } from '../schemas/common.schemas';
const mediaRoutes = new OpenAPIHono<AppContext>();

// Apply auth to all routes - media is project-specific
mediaRoutes.use('/:username/:slug/*', requireAuth);
// Reject oversized uploads with 413 before parseBody() buffers them.
mediaRoutes.use(
  '/:username/:slug',
  bodyLimit({ maxSize: MAX_MEDIA_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES })
);

// Schemas
const MediaItemSchema = z
  .object({
    filename: z.string().openapi({ example: 'cover.jpg', description: 'File name' }),
    size: z.number().openapi({ example: 102400, description: 'File size in bytes' }),
    mimeType: z.string().optional().openapi({ example: 'image/jpeg', description: 'MIME type' }),
    uploadedAt: z
      .string()
      .optional()
      .openapi({ example: '2024-01-15T10:30:00Z', description: 'Upload timestamp' }),
  })
  .openapi('MediaItem');

const MediaListResponseSchema = z
  .object({
    items: z.array(MediaItemSchema).openapi({ description: 'List of media files' }),
    total: z.number().openapi({ example: 5, description: 'Total number of items' }),
  })
  .openapi('MediaListResponse');

const ErrorSchema = z
  .object({
    message: z.string().openapi({ example: 'Error occurred', description: 'Error message' }),
  })
  .openapi('MediaError');

/**
 * Media upload can answer 403 for two unrelated reasons: an access-control
 * denial, or the sync-capacity refusal (which carries usage details). Both are
 * documented under the single 403 status as a union.
 */
const MediaUploadForbiddenSchema = z.union([ErrorSchema, QuotaExceededSchema]);

// List project media files
const listMediaRoute = createRoute({
  method: 'get',
  path: '/:username/:slug',
  operationId: 'listProjectMedia',
  tags: ['Media'],
  summary: 'List all media files in a project',
  description:
    'Returns a list of all media files (images, etc.) stored for a project. ' +
    'Used by the frontend to sync the media library.',
  request: {
    params: ProjectPathParamsSchema,
    query: z.object({
      prefix: z.string().optional().openapi({
        example: 'media-',
        description: 'Optional prefix to filter files',
      }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MediaListResponseSchema,
        },
      },
      description: 'List of media files',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Handler types are complex with OpenAPI error responses
mediaRoutes.openapi(listMediaRoute, async (c): Promise<any> => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user')?.id;
  const prefix = c.req.query('prefix');

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check access - owner or collaborator with read access
  const access = await collaborationService.checkAccess(db, project.id, userId);
  if (!access.canRead) {
    throw new ForbiddenError('Access denied');
  }

  // List files from storage
  const files = await storage.listProjectFiles(username, slug, prefix);

  // Filter to only include media files (images, audio, video, and published exports)
  const mediaFiles = files.filter((file) => {
    if (!file.mimeType) {
      // Include common media extensions without mime type
      return /\.(jpg|jpeg|png|gif|webp|svg|mp3|mp4|wav|ogg|pdf|epub|html|md)$/i.test(file.filename);
    }
    return (
      file.mimeType.startsWith('image/') ||
      file.mimeType.startsWith('audio/') ||
      file.mimeType.startsWith('video/') ||
      file.mimeType === 'application/pdf' ||
      file.mimeType === 'application/epub+zip' ||
      file.mimeType === 'text/html' ||
      file.mimeType === 'text/markdown'
    );
  });

  return c.json({
    items: mediaFiles.map((file) => ({
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      uploadedAt: file.uploadedAt?.toISOString(),
    })),
    total: mediaFiles.length,
  });
});

// Upload a media file
const uploadMediaRoute = createRoute({
  method: 'post',
  path: '/:username/:slug',
  operationId: 'uploadProjectMedia',
  tags: ['Media'],
  summary: 'Upload a media file to a project',
  description:
    'Uploads a media file (image, audio, video) to the project storage. ' +
    'Used by the frontend to sync local media to the server.',
  request: {
    params: ProjectPathParamsSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z
              .any()
              .openapi({ type: 'string', format: 'binary', description: 'File to upload' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            filename: z.string(),
            size: z.number(),
          }),
        },
      },
      description: 'File uploaded successfully',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid file',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: MediaUploadForbiddenSchema } },
      description: 'Access denied, or sync capacity exceeded (QUOTA_EXCEEDED)',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

mediaRoutes.openapi(uploadMediaRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user')?.id;

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check access - owner or collaborator with write access
  const access = await collaborationService.checkAccess(db, project.id, userId);
  if (!access.canWrite) {
    throw new ForbiddenError('Access denied');
  }

  // Get the uploaded file
  const body = await c.req.parseBody();
  const file = body['file'] || body['image'];

  if (!file || !(file instanceof File)) {
    throw new BadRequestError('No file provided');
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'application/pdf',
    'application/epub+zip',
    'text/html',
    'text/markdown',
  ];
  if (
    !allowedTypes.includes(file.type) &&
    !file.type.startsWith('image/') &&
    !file.type.startsWith('audio/') &&
    !file.type.startsWith('video/')
  ) {
    throw new BadRequestError(
      `Invalid file type: ${file.type}. Allowed: images, audio, video, PDF, EPUB, HTML, Markdown`
    );
  }

  // The client picks the filename; keep only a safe single path segment so
  // it cannot create nested keys inside the project's storage prefix.
  const filename = sanitizeUploadFilename(file.name);
  if (!filename) {
    throw new BadRequestError('Invalid filename');
  }

  // Read file data (one copy — Uint8Array over the buffer, no second clone)
  const data = new Uint8Array(await file.arrayBuffer());

  // Sync-capacity check, against the real byte length and before anything is
  // written. Re-uploading a file that already exists only counts the growth.
  const existing = await storedProjectFileSize(storage, username, slug, filename);
  await quotaService.assertCanStore(
    db,
    project.userId,
    data.byteLength,
    'media_upload',
    quotaStorageContext(c),
    existing
  );

  // Save to storage
  await storage.saveProjectFile(username, slug, filename, data, file.type);

  return c.json({
    message: 'File uploaded successfully',
    filename,
    size: data.byteLength,
  });
});

// Download a specific media file
const getMediaRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/:filename',
  operationId: 'getProjectMediaFile',
  tags: ['Media'],
  summary: 'Download a media file',
  description:
    'Downloads a specific media file from the project. ' +
    'Used by the frontend to sync individual files.',
  request: {
    params: ProjectPathParamsSchema.extend({
      filename: z.string().openapi({ example: 'cover.jpg', description: 'File name to download' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: 'File content',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'File not found',
    },
  },
});

mediaRoutes.openapi(getMediaRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const filename = c.req.param('filename');
  const userId = c.get('user')?.id;

  // Verify project exists and user has access
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Check access - owner or collaborator with read access
  const access = await collaborationService.checkAccess(db, project.id, userId);
  if (!access.canRead) {
    throw new ForbiddenError('Access denied');
  }

  // Read file. A missing file reads back as null on every backend, so there
  // is no separate existence check — that was an extra storage round trip
  // (an R2 HEAD on Workers) for every file a media sync downloads.
  const data = await storage.readProjectFile(username, slug, filename);
  if (!data) {
    throw new NotFoundError('File not found');
  }

  // Determine content type
  const contentType = lookup(filename) || 'application/octet-stream';

  const uint8Array = new Uint8Array(data);

  // Sanitize filename to prevent header injection (remove control chars, quotes, backslashes)
  const safeFilename = filename.replaceAll(/["\\\r\n]/g, '').replaceAll(/[^\x20-\x7E]/g, '_');

  // Serve potentially dangerous content types as attachment instead of inline
  const dangerousTypes = ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml'];
  const disposition = dangerousTypes.includes(contentType) ? 'attachment' : 'inline';

  return c.body(uint8Array, 200, {
    'Content-Type': contentType,
    'Content-Length': uint8Array.length.toString(),
    'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
    'X-Content-Type-Options': 'nosniff',
  });
});

// Delete a media file
const deleteMediaRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/:filename',
  operationId: 'deleteProjectMediaFile',
  tags: ['Media'],
  summary: 'Delete a media file',
  description:
    'Removes a media file from the project storage and credits its size back to the ' +
    "owner's sync capacity. Deleting a file that is already gone succeeds, so a client " +
    'can retry safely.',
  request: {
    params: ProjectPathParamsSchema.extend({
      filename: z.string().openapi({ example: 'cover.jpg', description: 'File name to delete' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            freedBytes: z.number().openapi({ description: 'Bytes released by the deletion' }),
          }),
        },
      },
      description: 'File deleted (or already absent)',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid filename',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Access denied',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

mediaRoutes.openapi(deleteMediaRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user')?.id;

  // Same single-segment rule as uploads: never let a name reach outside the
  // project's media area (published files and Yjs data live beside it).
  const filename = sanitizeUploadFilename(c.req.param('filename'));
  if (!filename || filename !== c.req.param('filename')) {
    throw new BadRequestError('Invalid filename');
  }

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  // Deleting media is a write: owner or collaborator with write access.
  const access = await collaborationService.checkAccess(db, project.id, userId);
  if (!access.canWrite) {
    throw new ForbiddenError('Access denied');
  }

  const freedBytes = await storedProjectFileSize(storage, username, slug, filename);
  if (freedBytes > 0) {
    await storage.deleteProjectFile(username, slug, filename);
    await quotaService.recordDeletion(db, project.userId, freedBytes);
  }

  return c.json({ message: 'File deleted', freedBytes }, 200);
});

export default mediaRoutes;
