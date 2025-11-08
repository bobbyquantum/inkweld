import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { HTTPException } from 'hono/http-exception';

const projectRoutes = new Hono();

// Validation schemas
const createProjectSchema = z.object({
  slug: z.string().min(1).max(100).describe('URL-friendly project identifier'),
  title: z.string().min(1).max(255).describe('Project title'),
  description: z.string().max(1000).optional().describe('Project description'),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(255).optional().describe('Updated project title'),
  description: z.string().max(1000).optional().describe('Updated project description'),
});

const projectSchema = z.object({
  id: z.string().describe('Project ID'),
  slug: z.string().describe('URL-friendly project identifier'),
  title: z.string().describe('Project title'),
  description: z.string().nullable().optional().describe('Project description'),
  createdDate: z.string().describe('Creation date'),
  updatedDate: z.string().describe('Last update date'),
});

const errorSchema = z.object({
  message: z.string().describe('Error message'),
});

const messageSchema = z.object({
  message: z.string().describe('Success message'),
});

// Get all projects for current user
projectRoutes.get(
  '/',
  describeRoute({
    description: 'Get all projects for the authenticated user',
    tags: ['Projects'],
    responses: {
      200: {
        description: 'List of projects',
        content: {
          'application/json': {
            schema: resolver(z.array(projectSchema)),
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
    },
  }),
  requireAuth,
  async (c) => {
    const userId = c.get('user').id;
    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);

    const projects = await projectRepo.find({
      where: { user: { id: userId } },
      order: { updatedDate: 'DESC' },
    });

    return c.json(projects);
  }
);

// Get single project by username and slug
projectRoutes.get(
  '/:username/:slug',
  describeRoute({
    description: 'Get a specific project by username and slug',
    tags: ['Projects'],
    responses: {
      200: {
        description: 'Project details',
        content: {
          'application/json': {
            schema: resolver(projectSchema),
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
  }
);

// Create project
projectRoutes.post(
  '/',
  describeRoute({
    description: 'Create a new project',
    tags: ['Projects'],
    responses: {
      201: {
        description: 'Project created successfully',
        content: {
          'application/json': {
            schema: resolver(projectSchema),
          },
        },
      },
      400: {
        description: 'Invalid input or project slug already exists',
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
    },
  }),
  requireAuth,
  zValidator('json', createProjectSchema),
  async (c) => {
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
  }
);

// Update project
projectRoutes.put(
  '/:username/:slug',
  describeRoute({
    description: 'Update a project',
    tags: ['Projects'],
    responses: {
      200: {
        description: 'Project updated successfully',
        content: {
          'application/json': {
            schema: resolver(projectSchema),
          },
        },
      },
      400: {
        description: 'Invalid input',
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
projectRoutes.delete(
  '/:username/:slug',
  describeRoute({
    description: 'Delete a project',
    tags: ['Projects'],
    responses: {
      200: {
        description: 'Project deleted successfully',
        content: {
          'application/json': {
            schema: resolver(messageSchema),
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
  }
);

export default projectRoutes;
