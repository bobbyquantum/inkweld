import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { imageService } from '../services/image.service';
import { getStorageService } from '../services/storage.service';
import { projectService } from '../services/project.service';
import { HTTPException } from 'hono/http-exception';
import { type AppContext } from '../types/context';

const imageRoutes = new Hono<AppContext>();

// Schemas
const messageSchema = z.object({
  message: z.string().describe('Success message'),
});

const errorSchema = z.object({
  message: z.string().describe('Error message'),
});

// Upload project cover image
imageRoutes.post(
  '/:username/:slug/cover',
  describeRoute({
    description: 'Upload a cover image for a project',
    tags: ['Images'],
    responses: {
      200: {
        description: 'Cover image uploaded successfully',
        content: {
          'application/json': {
            schema: resolver(messageSchema),
          },
        },
      },
      400: {
        description: 'Invalid file or no file uploaded',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      403: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
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

    return c.json({ message: 'Cover image uploaded successfully' });
  }
);

// Get project cover image
imageRoutes.get(
  '/:username/:slug/cover',
  describeRoute({
    description: 'Get the cover image for a project',
    tags: ['Images'],
    responses: {
      200: {
        description: 'Cover image',
        content: {
          'image/jpeg': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      404: {
        description: 'Cover image not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  }
);

// Delete project cover image
imageRoutes.delete(
  '/:username/:slug/cover',
  describeRoute({
    description: 'Delete the cover image for a project',
    tags: ['Images'],
    responses: {
      200: {
        description: 'Cover image deleted successfully',
        content: {
          'application/json': {
            schema: resolver(messageSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      403: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
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

    return c.json({ message: 'Cover image deleted successfully' });
  }
);

export default imageRoutes;
