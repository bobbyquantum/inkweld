import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { userService } from '../services/user.service';
import { documentSnapshotService } from '../services/document-snapshot.service';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import { type AppContext } from '../types/context';
import {
  DocumentSnapshotSchema,
  CreateSnapshotRequestSchema,
  SnapshotWithContentSchema,
} from '../schemas/snapshot.schemas';
import {
  ErrorResponseSchema,
  MessageResponseSchema,
  ProjectPathParamsSchema,
} from '../schemas/common.schemas';

const snapshotRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all snapshot routes
snapshotRoutes.use('*', requireAuth);

// Get snapshots route
const getSnapshotsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug',
  tags: ['Snapshots'],
  operationId: 'listProjectSnapshots',
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(DocumentSnapshotSchema),
        },
      },
      description: 'List of snapshots',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project not found',
    },
  },
});

snapshotRoutes.openapi(getSnapshotsRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const snapshots = await documentSnapshotService.findByProjectId(db, project.id);

  return c.json(
    snapshots.map((s) => ({
      ...s,
      createdAt: new Date(s.createdAt).toISOString(),
    })),
    200
  );
});

// Get single snapshot route
const getSnapshotRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/:snapshotId',
  tags: ['Snapshots'],
  operationId: 'getProjectSnapshot',
  request: {
    params: ProjectPathParamsSchema.extend({
      snapshotId: z.string().openapi({ description: 'Snapshot ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SnapshotWithContentSchema,
        },
      },
      description: 'Snapshot details with document state',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project or snapshot not found',
    },
  },
});

snapshotRoutes.openapi(getSnapshotRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const snapshotId = c.req.param('snapshotId');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const snapshot = await documentSnapshotService.findById(db, snapshotId);

  if (!snapshot || snapshot.projectId !== project.id) {
    throw new NotFoundError('Snapshot not found');
  }

  const response = {
    ...snapshot,
    createdAt: new Date(snapshot.createdAt).toISOString(),
    yDocState: snapshot.yDocState.toString('base64'),
    stateVector: snapshot.stateVector?.toString('base64'),
  };

  return c.json(response, 200);
});

// Create snapshot route
const createSnapshotRoute = createRoute({
  method: 'post',
  path: '/:username/:slug',
  tags: ['Snapshots'],
  operationId: 'createProjectSnapshot',
  request: {
    params: ProjectPathParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: CreateSnapshotRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: DocumentSnapshotSchema,
        },
      },
      description: 'Snapshot created successfully',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid input data',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied - not project owner',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project not found',
    },
  },
});

snapshotRoutes.openapi(createSnapshotRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;
  const body = await c.req.json();
  const data = CreateSnapshotRequestSchema.parse(body);

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const user = await userService.findById(db, userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const snapshot = await documentSnapshotService.create(db, {
    documentId: data.documentId,
    projectId: project.id,
    userId: user.id,
    name: data.name,
    description: data.description,
    yDocState: Buffer.from(data.yDocState, 'base64'),
    stateVector: data.stateVector ? Buffer.from(data.stateVector, 'base64') : undefined,
    wordCount: data.wordCount,
    metadata: data.metadata,
  });

  return c.json(
    {
      id: snapshot.id,
      documentId: snapshot.documentId,
      name: snapshot.name,
      description: snapshot.description,
      wordCount: snapshot.wordCount,
      metadata: snapshot.metadata,
      createdAt: new Date(snapshot.createdAt).toISOString(),
    },
    201
  );
});

// Delete snapshot route
const deleteSnapshotRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/:snapshotId',
  tags: ['Snapshots'],
  operationId: 'deleteProjectSnapshot',
  request: {
    params: ProjectPathParamsSchema.extend({
      snapshotId: z.string().openapi({ description: 'Snapshot ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
      description: 'Snapshot deleted successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied - not project owner',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project or snapshot not found',
    },
  },
});

snapshotRoutes.openapi(deleteSnapshotRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const snapshotId = c.req.param('snapshotId');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const snapshot = await documentSnapshotService.findById(db, snapshotId);

  if (!snapshot || snapshot.projectId !== project.id) {
    throw new NotFoundError('Snapshot not found');
  }

  await documentSnapshotService.delete(db, snapshotId);

  return c.json({ message: 'Snapshot deleted successfully' }, 200);
});

// Restore snapshot route
const RestoreResponseSchema = z
  .object({
    message: z
      .string()
      .openapi({ example: 'Snapshot can be restored', description: 'Status message' }),
    snapshotId: z.string().openapi({ example: 'snap-123', description: 'Snapshot ID' }),
  })
  .openapi('RestoreResponse');

const restoreSnapshotRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/:snapshotId/restore',
  tags: ['Snapshots'],
  operationId: 'restoreProjectSnapshot',
  request: {
    params: ProjectPathParamsSchema.extend({
      snapshotId: z.string().openapi({ description: 'Snapshot ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: RestoreResponseSchema,
        },
      },
      description: 'Snapshot restored successfully',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied - not project owner',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project or snapshot not found',
    },
  },
});

snapshotRoutes.openapi(restoreSnapshotRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const snapshotId = c.req.param('snapshotId');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const snapshot = await documentSnapshotService.findById(db, snapshotId);

  if (!snapshot || snapshot.projectId !== project.id) {
    throw new NotFoundError('Snapshot not found');
  }

  return c.json({ message: 'Snapshot can be restored', snapshotId: snapshot.id }, 200);
});

// Preview snapshot route
const previewSnapshotRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/:snapshotId/preview',
  tags: ['Snapshots'],
  operationId: 'previewProjectSnapshot',
  request: {
    params: ProjectPathParamsSchema.extend({
      snapshotId: z.string().openapi({ description: 'Snapshot ID' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SnapshotWithContentSchema,
        },
      },
      description: 'Snapshot preview',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Access denied',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Project or snapshot not found',
    },
  },
});

snapshotRoutes.openapi(previewSnapshotRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const snapshotId = c.req.param('snapshotId');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError();
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError();
  }

  const snapshot = await documentSnapshotService.findById(db, snapshotId);

  if (!snapshot || snapshot.projectId !== project.id) {
    throw new NotFoundError('Snapshot not found');
  }

  const response = {
    ...snapshot,
    createdAt: new Date(snapshot.createdAt).toISOString(),
    yDocState: snapshot.yDocState.toString('base64'),
    stateVector: snapshot.stateVector?.toString('base64'),
  };

  return c.json(response, 200);
});

export default snapshotRoutes;
