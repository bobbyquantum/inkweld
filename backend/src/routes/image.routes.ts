import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { imageService } from '../services/image.service';
import { getStorageService } from '../services/storage.service';
import { projectService } from '../services/project.service';
import { HTTPException } from 'hono/http-exception';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const imageRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all image routes
imageRoutes.use('*', requireAuth);

// Schemas
const MessageSchema = z
  .object({
    message: z.string().openapi({ example: 'Success', description: 'Success message' }),
  })
  .openapi('ImageMessage');

const ErrorSchema = z
  .object({
    message: z.string().openapi({ example: 'Error occurred', description: 'Error message' }),
  })
  .openapi('ImageError');

// Upload project cover image route
const uploadCoverRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/cover',
  operationId: 'uploadProjectCover',
  tags: ['Images'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Cover image uploaded successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Invalid file or no file uploaded',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Access denied',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Project not found',
    },
  },
});

imageRoutes.openapi(uploadCoverRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user')?.id;

  if (!userId) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  // Get the uploaded file
  const body = await c.req.parseBody();
  const file = body['cover'] as File;

  if (!file) {
    throw new HTTPException(400, { message: 'No file uploaded' });
  }

  // Verify project ownership
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.userId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate image
  const validation = await imageService.validateImage(buffer);
  if (!validation.valid) {
    throw new HTTPException(400, { message: validation.error || 'Invalid image' });
  }

  // Process image
  const processedImage = await imageService.processCoverImage(buffer);

  // Save image to storage (R2 or filesystem)
  await storage.saveProjectFile(username, slug, 'cover.jpg', processedImage, 'image/jpeg');

  // Update project to set coverImage field
  await projectService.update(db, project.id, { coverImage: 'cover.jpg' });

  return c.json({ message: 'Cover image uploaded successfully' });
});

// Get project cover image route
const getCoverRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/cover',
  operationId: 'getProjectCover',
  tags: ['Images'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'image/jpeg': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: 'Cover image',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Cover image not found',
    },
  },
});

imageRoutes.openapi(getCoverRoute, async (c) => {
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  const exists = await storage.projectFileExists(username, slug, 'cover.jpg');

  if (!exists) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  const data = await storage.readProjectFile(username, slug, 'cover.jpg');
  if (!data) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  const uint8Array = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);

  return c.body(uint8Array, 200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': uint8Array.length.toString(),
  });
});

// Delete project cover image route
const deleteCoverRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/cover',
  operationId: 'deleteProjectCover',
  tags: ['Images'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Cover image deleted successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Access denied',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Project not found',
    },
  },
});

imageRoutes.openapi(deleteCoverRoute, async (c) => {
  const db = c.get('db');
  const storage = getStorageService(c.get('storage'));
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user')?.id;

  if (!userId) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  // Verify project ownership
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.userId !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const exists = await storage.projectFileExists(username, slug, 'cover.jpg');

  if (!exists) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  await storage.deleteProjectFile(username, slug, 'cover.jpg');

  // Update project to clear coverImage field
  await projectService.update(db, project.id, { coverImage: null });

  return c.json({ message: 'Cover image deleted successfully' });
});

export default imageRoutes;
