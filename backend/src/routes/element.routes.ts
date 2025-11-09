import { Hono } from 'hono';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { getDb, type AppContext } from '../middleware/database.middleware';

const elementRoutes = new Hono<AppContext>();

// Schemas
const elementSchema = z.object({
  id: z.string().describe('Element ID'),
  name: z.string().describe('Element name'),
  type: z.enum(['FOLDER', 'ITEM']).describe('Element type'),
  parentId: z.string().nullable().describe('Parent element ID'),
  order: z.number().describe('Order in parent'),
  level: z.number().describe('Nesting level in tree hierarchy'),
  expandable: z.boolean().describe('Whether element can be expanded (folders)'),
  version: z.number().describe('Version number for optimistic locking'),
  metadata: z.record(z.string(), z.string()).describe('Element metadata key-value pairs'),
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
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');

    // Verify project exists
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }

    // Placeholder - full implementation would query elements from Yjs document
    // The elements are stored in a Yjs Map in the project's elements document
    return c.json([]);
  }
);

export default elementRoutes;
