import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { userService } from '../services/user.service';
import { documentSnapshotService } from '../services/document-snapshot.service';
import { HTTPException } from 'hono/http-exception';
import { getDb, type AppContext } from '../middleware/database.middleware';
import {
  DocumentSnapshotSchema,
  CreateSnapshotRequestSchema,
  SnapshotsListResponseSchema,
  SnapshotWithContentSchema,
} from '../schemas/snapshot.schemas';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';

const snapshotRoutes = new Hono<AppContext>();

// Get snapshots for a project
snapshotRoutes.get(
  '/:username/:slug',
  describeRoute({
    description: 'Get all snapshots for a project',
    tags: ['Snapshots'],
    responses: {
      200: {
        description: 'List of snapshots',
        content: {
          'application/json': {
            schema: resolver(SnapshotsListResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
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
    const userId = c.get('user').id;

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get snapshots
    const snapshots = await documentSnapshotService.findByProjectId(db, project.id);

    return c.json(snapshots);
  }
);

// Get single snapshot
snapshotRoutes.get(
  '/:username/:slug/:snapshotId',
  describeRoute({
    description: 'Get a specific snapshot with full document state',
    tags: ['Snapshots'],
    responses: {
      200: {
        description: 'Snapshot details with document state',
        content: {
          'application/json': {
            schema: resolver(SnapshotWithContentSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project or snapshot not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
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
    const snapshotId = c.req.param('snapshotId');
    const userId = c.get('user').id;

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get snapshot
    const snapshot = await documentSnapshotService.findById(db, snapshotId);

    if (!snapshot || snapshot.projectId !== project.id) {
      throw new HTTPException(404, { message: 'Snapshot not found' });
    }

    // Convert Buffer to Base64 for transmission
    const response = {
      ...snapshot,
      yDocState: snapshot.yDocState.toString('base64'),
      stateVector: snapshot.stateVector?.toString('base64'),
    };

    return c.json(response);
  }
);

// Create snapshot
snapshotRoutes.post(
  '/:username/:slug',
  describeRoute({
    description: 'Create a new snapshot for a document in the project',
    tags: ['Snapshots'],
    responses: {
      201: {
        description: 'Snapshot created successfully',
        content: {
          'application/json': {
            schema: resolver(DocumentSnapshotSchema),
          },
        },
      },
      400: {
        description: 'Invalid input data',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied - not project owner',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  validator('json', CreateSnapshotRequestSchema),
  async (c) => {
    const db = getDb(c);
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;
    const data = c.req.valid('json');

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get user
    const user = await userService.findById(db, userId);
    if (!user) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    // Create snapshot
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
        createdAt: snapshot.createdAt,
      },
      201
    );
  }
);

// Delete snapshot
snapshotRoutes.delete(
  '/:username/:slug/:snapshotId',
  describeRoute({
    description: 'Delete a snapshot from the project',
    tags: ['Snapshots'],
    responses: {
      200: {
        description: 'Snapshot deleted successfully',
        content: {
          'application/json': {
            schema: resolver(MessageResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied - not project owner',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project or snapshot not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
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
    const snapshotId = c.req.param('snapshotId');
    const userId = c.get('user').id;

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get and delete snapshot
    const snapshot = await documentSnapshotService.findById(db, snapshotId);

    if (!snapshot || snapshot.projectId !== project.id) {
      throw new HTTPException(404, { message: 'Snapshot not found' });
    }

    await documentSnapshotService.delete(db, snapshotId);

    return c.json({ message: 'Snapshot deleted successfully' });
  }
);

// Restore snapshot
snapshotRoutes.post(
  '/:username/:slug/:snapshotId/restore',
  describeRoute({
    description: 'Restore a document from a snapshot',
    tags: ['Snapshots'],
    responses: {
      200: {
        description: 'Snapshot restored successfully',
        content: {
          'application/json': {
            schema: resolver(MessageResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied - not project owner',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project or snapshot not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
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
    const snapshotId = c.req.param('snapshotId');
    const userId = c.get('user').id;

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get snapshot
    const snapshot = await documentSnapshotService.findById(db, snapshotId);

    if (!snapshot || snapshot.projectId !== project.id) {
      throw new HTTPException(404, { message: 'Snapshot not found' });
    }

    // Note: Actual restoration would be handled by the Yjs service
    // This endpoint confirms the snapshot exists and user has permission
    return c.json({ message: 'Snapshot can be restored', snapshotId: snapshot.id });
  }
);

// Preview snapshot
snapshotRoutes.get(
  '/:username/:slug/:snapshotId/preview',
  describeRoute({
    description: 'Get a preview of the snapshot content',
    tags: ['Snapshots'],
    responses: {
      200: {
        description: 'Snapshot preview',
        content: {
          'application/json': {
            schema: resolver(SnapshotWithContentSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Access denied',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'Project or snapshot not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
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
    const snapshotId = c.req.param('snapshotId');
    const userId = c.get('user').id;

    // Verify project ownership
    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Get snapshot with full state
    const snapshot = await documentSnapshotService.findById(db, snapshotId);

    if (!snapshot || snapshot.projectId !== project.id) {
      throw new HTTPException(404, { message: 'Snapshot not found' });
    }

    // Convert Buffer to Base64 for transmission
    const response = {
      ...snapshot,
      yDocState: snapshot.yDocState.toString('base64'),
      stateVector: snapshot.stateVector?.toString('base64'),
    };

    return c.json(response);
  }
);

export default snapshotRoutes;
