import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { projectService } from '../services/project.service';
import { yjsService } from '../services/yjs.service';
import { collaborationService } from '../services/collaboration.service';
import { requireAuth } from '../middleware/auth';
import { logger } from '../services/logger.service';
import { type AppContext } from '../types/context';
import { ProjectPathParamsSchema } from '../schemas/common.schemas';
import { ElementSchema, ElementErrorSchema } from '../schemas/element.schemas';

const elementLog = logger.child('Elements');
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
    403: {
      content: {
        'application/json': {
          schema: ElementErrorSchema,
        },
      },
      description: 'Unauthorized access',
    },
    500: {
      content: {
        'application/json': {
          schema: ElementErrorSchema,
        },
      },
      description: 'Internal server error',
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

  // Check access - owner or collaborator (user is guaranteed by requireAuth middleware)
  const user = c.get('user');
  if (user && project.userId !== user.id) {
    // Not the owner, check if they're a collaborator
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canRead) {
      elementLog.warn(
        `User ${user.username} attempted to access elements in project ${username}/${slug}`
      );
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  // Fetch elements from Yjs document
  try {
    const elements = await yjsService.getElements(username, slug);
    return c.json(elements, 200);
  } catch (error) {
    elementLog.error('Error fetching elements', error);
    return c.json({ error: 'Failed to fetch elements' }, 500);
  }
});

export default elementRoutes;
