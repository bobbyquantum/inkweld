import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { requireAuth } from '../middleware/auth';

const elementRoutes = new Hono();

// Schemas
const elementSchema = z.object({
  id: z.string().describe('Element ID'),
  name: z.string().describe('Element name'),
  type: z.enum(['FOLDER', 'ITEM']).describe('Element type'),
  parentId: z.string().nullable().describe('Parent element ID'),
  order: z.number().describe('Order in parent'),
  createdAt: z.string().optional().describe('Creation timestamp'),
  updatedAt: z.string().optional().describe('Last update timestamp'),
});

const errorSchema = z.object({
  error: z.string().describe('Error message'),
});

// Get all elements for a project
elementRoutes.get(
  '/:username/:slug/elements',
  describeRoute({
    description: 'Get all project elements (folder structure)',
    tags: ['Elements'],
    responses: {
      200: {
        description: 'List of project elements',
        content: {
          'application/json': {
            schema: resolver(z.array(elementSchema)),
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

    // Placeholder - full implementation would query elements from Yjs document
    // The elements are stored in a Yjs Map in the project's elements document
    return c.json([]);
  }
);

export default elementRoutes;
