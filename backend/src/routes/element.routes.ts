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

// ─────────────────────────────────────────────────────────────────────────────
// Batch element identity images
// ─────────────────────────────────────────────────────────────────────────────

const elementImagesRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/element-images',
  operationId: 'getElementImages',
  tags: ['Elements'],
  request: {
    params: ProjectPathParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            elementIds: z.array(z.string()).min(1).max(200),
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
            images: z.record(z.string(), z.string().nullable()),
          }),
        },
      },
      description: 'Map of element ID to image URL (or null)',
    },
    400: {
      content: { 'application/json': { schema: ElementErrorSchema } },
      description: 'Validation error / Bad request',
    },
    401: {
      content: { 'application/json': { schema: ElementErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ElementErrorSchema } },
      description: 'Unauthorized access',
    },
    404: {
      content: { 'application/json': { schema: ElementErrorSchema } },
      description: 'Project not found',
    },
    500: {
      content: { 'application/json': { schema: ElementErrorSchema } },
      description: 'Internal server error',
    },
  },
});

elementRoutes.openapi(elementImagesRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  if (project.userId !== user.id) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canRead) {
      return c.json({ error: 'Unauthorized' }, 403);
    }
  }

  try {
    const { elementIds } = c.req.valid('json');
    const images: Record<string, string | null> = {};
    const failedIds: string[] = [];

    await Promise.all(
      elementIds.map(async (elementId) => {
        try {
          const docId = `${username}:${slug}:${elementId}/`;
          const sharedDoc = await yjsService.getDocument(docId);
          const identityMap = sharedDoc.doc.getMap('identity');
          const image = identityMap.get('image') as string | undefined;
          images[elementId] = image ?? null;
        } catch (error) {
          elementLog.error('Failed to fetch element image', error, { elementId });
          images[elementId] = null;
          failedIds.push(elementId);
        }
      })
    );

    if (failedIds.length > 0) {
      elementLog.warn(
        `Partial failure: ${failedIds.length} element image(s) could not be fetched`,
        { failedIds }
      );
    }

    return c.json({ images }, 200);
  } catch (error) {
    elementLog.error('Error fetching element images', error);
    return c.json({ error: 'Failed to fetch element images' }, 500);
  }
});

export default elementRoutes;
