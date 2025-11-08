import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { DocumentSnapshot } from '../entities/document-snapshot.entity';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { HTTPException } from 'hono/http-exception';

const snapshotRoutes = new Hono();

// Validation schemas
const createSnapshotSchema = z.object({
  documentId: z.string().min(1).describe('Document ID'),
  name: z.string().min(1).max(255).describe('Snapshot name'),
  description: z.string().max(1000).optional().describe('Snapshot description'),
  yDocState: z.string().describe('Base64 encoded Yjs document state'),
  stateVector: z.string().optional().describe('Base64 encoded state vector'),
  wordCount: z.number().optional().describe('Word count'),
  metadata: z.record(z.any()).optional().describe('Additional metadata'),
});

const snapshotSchema = z.object({
  id: z.string().describe('Snapshot ID'),
  documentId: z.string().describe('Document ID'),
  name: z.string().describe('Snapshot name'),
  description: z.string().nullable().optional().describe('Snapshot description'),
  wordCount: z.number().nullable().optional().describe('Word count'),
  metadata: z.record(z.any()).nullable().optional().describe('Additional metadata'),
  createdAt: z.string().describe('Creation timestamp'),
});

const snapshotDetailSchema = snapshotSchema.extend({
  yDocState: z.string().describe('Base64 encoded Yjs document state'),
  stateVector: z.string().nullable().optional().describe('Base64 encoded state vector'),
});

const errorSchema = z.object({
  message: z.string().describe('Error message'),
});

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
            schema: resolver(z.array(snapshotSchema)),
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

    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);
    const snapshotRepo = dataSource.getRepository(DocumentSnapshot);

    // Verify project ownership
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

    // Get snapshots
    const snapshots = await snapshotRepo.find({
      where: { project: { id: project.id } },
      order: { createdAt: 'DESC' },
      select: ['id', 'documentId', 'name', 'description', 'wordCount', 'metadata', 'createdAt'],
    });

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
            schema: resolver(snapshotDetailSchema),
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
        description: 'Project or snapshot not found',
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
    const snapshotId = c.req.param('snapshotId');
    const userId = c.get('user').id;

    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);
    const snapshotRepo = dataSource.getRepository(DocumentSnapshot);

    // Verify project ownership
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

    // Get snapshot
    const snapshot = await snapshotRepo.findOne({
      where: { id: snapshotId, project: { id: project.id } },
    });

    if (!snapshot) {
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
            schema: resolver(snapshotSchema),
          },
        },
      },
      400: {
        description: 'Invalid input data',
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
        description: 'Access denied - not project owner',
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
  zValidator('json', createSnapshotSchema),
  async (c) => {
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;
    const data = c.req.valid('json');

    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);
    const userRepo = dataSource.getRepository(User);
    const snapshotRepo = dataSource.getRepository(DocumentSnapshot);

    // Verify project ownership
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

    // Get user
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    // Create snapshot
    const snapshot = snapshotRepo.create({
      documentId: data.documentId,
      name: data.name,
      description: data.description,
      yDocState: Buffer.from(data.yDocState, 'base64'),
      stateVector: data.stateVector ? Buffer.from(data.stateVector, 'base64') : undefined,
      wordCount: data.wordCount,
      metadata: data.metadata,
      project,
      user,
    });

    await snapshotRepo.save(snapshot);

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
            schema: resolver(
              z.object({
                message: z.string().describe('Success message'),
              })
            ),
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
        description: 'Access denied - not project owner',
        content: {
          'application/json': {
            schema: resolver(errorSchema),
          },
        },
      },
      404: {
        description: 'Project or snapshot not found',
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
  const snapshotId = c.req.param('snapshotId');
  const userId = c.get('user').id;

  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);
  const snapshotRepo = dataSource.getRepository(DocumentSnapshot);

  // Verify project ownership
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

  // Get and delete snapshot
  const snapshot = await snapshotRepo.findOne({
    where: { id: snapshotId, project: { id: project.id } },
  });

  if (!snapshot) {
    throw new HTTPException(404, { message: 'Snapshot not found' });
  }

  await snapshotRepo.remove(snapshot);

  return c.json({ message: 'Snapshot deleted successfully' });
});

export default snapshotRoutes;
