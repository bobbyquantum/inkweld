import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { imageService } from '../services/image.service';
import { fileStorageService } from '../services/file-storage.service';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { HTTPException } from 'hono/http-exception';

const imageRoutes = new Hono();

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
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;

    // Get the uploaded file
    const body = await c.req.parseBody();
    const file = body['cover'] as File;

    if (!file) {
      throw new HTTPException(400, { message: 'No file uploaded' });
    }

    // Verify project ownership
    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);
    const project = await projectRepo.findOne({
      where: { slug, user: { username } },
      relations: ['user'],
    });

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.user.id !== userId) {
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

    // Save image
    await fileStorageService.saveProjectFile(username, slug, 'cover.jpg', processedImage);

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
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    const exists = await fileStorageService.projectFileExists(username, slug, 'cover.jpg');

    if (!exists) {
      throw new HTTPException(404, { message: 'Cover image not found' });
    }

    const buffer = await fileStorageService.readProjectFile(username, slug, 'cover.jpg');

    return c.body(buffer, 200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': buffer.length.toString(),
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
    const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;

  // Verify project ownership
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);
  const project = await projectRepo.findOne({
    where: { slug, user: { username } },
    relations: ['user'],
  });

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.user.id !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const exists = await fileStorageService.projectFileExists(username, slug, 'cover.jpg');

  if (!exists) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  await fileStorageService.deleteProjectFile(username, slug, 'cover.jpg');

  return c.json({ message: 'Cover image deleted successfully' });
});

export default imageRoutes;
