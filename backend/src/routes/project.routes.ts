import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { HTTPException } from 'hono/http-exception';

const projectRoutes = new Hono();

// Validation schemas
const createProjectSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
});

// Get all projects for current user
projectRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);

  const projects = await projectRepo.find({
    where: { user: { id: userId } },
    order: { updatedDate: 'DESC' },
  });

  return c.json(projects);
});

// Get single project by username and slug
projectRoutes.get('/:username/:slug', requireAuth, async (c) => {
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;

  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);

  const project = await projectRepo.findOne({
    where: { slug, user: { username } },
    relations: ['user'],
  });

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  // Check if user owns this project
  if (project.user.id !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json(project);
});

// Create project
projectRoutes.post('/', requireAuth, zValidator('json', createProjectSchema), async (c) => {
  const { slug, title, description } = c.req.valid('json');
  const userId = c.get('user').id;

  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);
  const userRepo = dataSource.getRepository(User);

  // Get user
  const user = await userRepo.findOne({ where: { id: userId } });
  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if project with same slug exists for this user
  const existing = await projectRepo.findOne({
    where: { slug, user: { id: userId } },
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Project with this slug already exists' });
  }

  // Create project
  const project = projectRepo.create({
    slug,
    title,
    description,
    user,
  });

  await projectRepo.save(project);

  return c.json(project, 201);
});

// Update project
projectRoutes.put(
  '/:username/:slug',
  requireAuth,
  zValidator('json', updateProjectSchema),
  async (c) => {
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;
    const updates = c.req.valid('json');

    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);

    const project = await projectRepo.findOne({
      where: { slug, user: { username } },
      relations: ['user'],
    });

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    // Check ownership
    if (project.user.id !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Update fields
    if (updates.title) project.title = updates.title;
    if (updates.description !== undefined) project.description = updates.description;

    await projectRepo.save(project);

    return c.json(project);
  }
);

// Delete project
projectRoutes.delete('/:username/:slug', requireAuth, async (c) => {
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;

  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);

  const project = await projectRepo.findOne({
    where: { slug, user: { username } },
    relations: ['user'],
  });

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  // Check ownership
  if (project.user.id !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await projectRepo.remove(project);

  return c.json({ message: 'Project deleted successfully' });
});

export default projectRoutes;
