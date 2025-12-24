import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';
import { ElementSchema, ElementErrorSchema } from '../schemas/element.schemas';

const elementRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all element routes
elementRoutes.use('*', requireAuth);

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
          schema: ElementErrorSchema,
        },
      },
      description: 'Not authenticated',
    },
    404: {
      content: {
        'application/json': {
          schema: ElementErrorSchema,
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
