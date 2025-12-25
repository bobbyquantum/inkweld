import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { lookup } from 'mime-types';
import { requireAuth } from '../middleware/auth';
import { getStorageService } from '../services/storage.service';
import { projectService } from '../services/project.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const mediaRoutes = new OpenAPIHono<AppContext>();

// Apply auth to all routes - media is project-specific
mediaRoutes.use('/:username/:slug/*', requireAuth);

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

  // Check access - owner or collaborator
  if (project.userId !== userId) {
    // TODO: Check collaborator access when implemented
    throw new ForbiddenError('Access denied');
  }

  // List files from storage
  const files = await storage.listProjectFiles(username, slug, prefix);

  // Filter to only include media files (images, audio, video)
  const mediaFiles = files.filter((file) => {
    if (!file.mimeType) {
      // Include common media extensions without mime type
      return /\.(jpg|jpeg|png|gif|webp|svg|mp3|mp4|wav|ogg)$/i.test(file.filename);
    }
    return (
      file.mimeType.startsWith('image/') ||
      file.mimeType.startsWith('audio/') ||
      file.mimeType.startsWith('video/')
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
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Access denied',
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

  // Check access - owner only for upload
  if (project.userId !== userId) {
    throw new ForbiddenError('Access denied');
  }

  // Get the uploaded file
  const body = await c.req.parseBody();
  const file = body['file'] || body['image'];

  if (!file || !(file instanceof File)) {
    throw new BadRequestError('No file provided');
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw new BadRequestError(`Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`);
  }

  // Read file data
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // Save to storage
  await storage.saveProjectFile(username, slug, file.name, data, file.type);

  return c.json({
    message: 'File uploaded successfully',
    filename: file.name,
    size: data.length,
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

  // Check access - owner or collaborator
  if (project.userId !== userId) {
    // TODO: Check collaborator access when implemented
    throw new ForbiddenError('Access denied');
  }

  // Check if file exists
  const exists = await storage.projectFileExists(username, slug, filename);
  if (!exists) {
    throw new NotFoundError('File not found');
  }

  // Read file
  const data = await storage.readProjectFile(username, slug, filename);
  if (!data) {
    throw new NotFoundError('File not found');
  }

  // Determine content type
  const contentType = lookup(filename) || 'application/octet-stream';

  const uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);

  return c.body(uint8Array, 200, {
    'Content-Type': contentType,
    'Content-Length': uint8Array.length.toString(),
    'Content-Disposition': `inline; filename="${filename}"`,
  });
});

export default mediaRoutes;
