import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';

const elementRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all element routes
elementRoutes.use('*', requireAuth);

// Schemas
const ElementSchema = z
  .object({
    id: z.string().openapi({ example: 'elem-123', description: 'Element ID' }),
    name: z.string().openapi({ example: 'Chapter 1', description: 'Element name' }),
    type: z
      .enum([
        'FOLDER',
        'ITEM',
        'CHARACTER',
        'LOCATION',
        'WB_ITEM',
        'MAP',
        'RELATIONSHIP',
        'PHILOSOPHY',
        'CULTURE',
        'SPECIES',
        'SYSTEMS',
      ])
      .openapi({ example: 'ITEM', description: 'Element type' }),
    parentId: z.string().nullable().openapi({ example: null, description: 'Parent element ID' }),
    order: z.number().openapi({ example: 0, description: 'Order in parent' }),
    level: z.number().openapi({ example: 0, description: 'Nesting level in tree hierarchy' }),
    expandable: z
      .boolean()
      .openapi({ example: false, description: 'Whether element can be expanded (folders)' }),
    version: z
      .number()
      .openapi({ example: 1, description: 'Version number for optimistic locking' }),
    metadata: z
      .record(z.string(), z.string())
      .openapi({ description: 'Element metadata key-value pairs' }),
    createdAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Creation timestamp' }),
    updatedAt: z
      .string()
      .optional()
      .openapi({ example: '2023-01-01T00:00:00.000Z', description: 'Last update timestamp' }),
  })
  .openapi('Element');

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'An error occurred', description: 'Error message' }),
  })
  .openapi('ElementError');

// Get all elements for a project
const listElementsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/elements',
  operationId: 'listProjectElements',
  tags: ['Elements'],
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(ElementSchema),
        },
      },
      description: 'List of project elements',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorSchema,
        },
      },
      description: 'Not authenticated',
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

elementRoutes.openapi(listElementsRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  // Verify project exists
  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Placeholder - full implementation would query elements from Yjs document
  // The elements are stored in a Yjs Map in the project's elements document
  return c.json([], 200);
});

export default elementRoutes;
