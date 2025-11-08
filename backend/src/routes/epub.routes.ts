import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { requireAuth } from '../middleware/auth';

const epubRoutes = new Hono();

// Schemas
const epubResponseSchema = z.object({
  originalName: z.string().describe('Original filename'),
  storedName: z.string().describe('Stored filename'),
  contentType: z.string().describe('MIME type'),
  size: z.number().describe('File size in bytes'),
  uploadDate: z.string().describe('Creation timestamp'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// Export project as EPUB
epubRoutes.post(
  '/:username/:slug/epub',
  describeRoute({
    description: 'Export project as EPUB file',
    tags: ['Export'],
    responses: {
      200: {
        description: 'EPUB export metadata',
        content: {
          'application/json': {
            schema: resolver(epubResponseSchema),
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
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      500: {
        description: 'Export failed',
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

    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);

    // Verify project exists
    const project = await projectRepo.findOne({
      where: { slug, user: { username } },
      relations: ['user'],
    });

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Placeholder - full implementation would:
    // 1. Load project elements from Yjs
    // 2. Load document content from LevelDB
    // 3. Use @smoores/epub to generate EPUB file
    // 4. Save to file storage
    // 5. Return metadata
    return c.json(
      {
        error: 'EPUB export not yet implemented in Hono backend',
      },
      501
    );
  }
);

export default epubRoutes;
