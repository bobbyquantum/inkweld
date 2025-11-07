import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
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
  documentId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  yDocState: z.string(), // Base64 encoded
  stateVector: z.string().optional(), // Base64 encoded
  wordCount: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

// Get snapshots for a project
snapshotRoutes.get('/:username/:slug', requireAuth, async (c) => {
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
});

// Get single snapshot
snapshotRoutes.get('/:username/:slug/:snapshotId', requireAuth, async (c) => {
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
});

// Create snapshot
snapshotRoutes.post(
  '/:username/:slug',
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
snapshotRoutes.delete('/:username/:slug/:snapshotId', requireAuth, async (c) => {
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
