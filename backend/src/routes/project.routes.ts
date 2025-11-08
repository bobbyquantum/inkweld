import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { describeRoute, resolver } from 'hono-openapi';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { HTTPException } from 'hono/http-exception';
import {
  ProjectSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  ProjectsListResponseSchema,
} from '../schemas/project.schemas';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';

const projectRoutes = new Hono();

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
            schema: resolver(ProjectsListResponseSchema),
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
    },
  }),
  requireAuth,
  async (c) => {
    const userId = c.get('user').id;
    const dataSource = getDataSource();
    const projectRepo = dataSource.getRepository(Project);

    const projects = await projectRepo.find({
      where: { user: { id: userId } },
      relations: ['user'],
      order: { updatedDate: 'DESC' },
    });

    // Map projects to flat structure matching old NestJS server
    const projectsFlat = projects.map((project) => ({
      id: project.id,
      version: project.version,
      slug: project.slug,
      title: project.title,
      description: project.description,
      createdDate: project.createdDate,
      updatedDate: project.updatedDate,
      username: project.user.username, // Flat, not nested
    }));

    return c.json(projectsFlat);
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
            schema: resolver(ProjectSchema),
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

    // Return flat structure matching old NestJS server
    return c.json({
      id: project.id,
      version: project.version,
      slug: project.slug,
      title: project.title,
      description: project.description,
      createdDate: project.createdDate,
      updatedDate: project.updatedDate,
      username: project.user.username, // Flat, not nested
    });
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
            schema: resolver(ProjectSchema),
          },
        },
      },
      400: {
        description: 'Invalid input or project slug already exists',
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
    },
  }),
  requireAuth,
  validator('json', CreateProjectRequestSchema),
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

    // Return flat structure matching old NestJS server
    return c.json(
      {
        id: project.id,
        version: project.version,
        slug: project.slug,
        title: project.title,
        description: project.description,
        createdDate: project.createdDate,
        updatedDate: project.updatedDate,
        username: user.username, // Flat, not nested
      },
      201
    );
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
            schema: resolver(ProjectSchema),
          },
        },
      },
      400: {
        description: 'Invalid input',
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
  validator('json', UpdateProjectRequestSchema),
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

    // Return flat structure matching old NestJS server
    return c.json({
      id: project.id,
      version: project.version,
      slug: project.slug,
      title: project.title,
      description: project.description,
      createdDate: project.createdDate,
      updatedDate: project.updatedDate,
      username: project.user.username, // Flat, not nested
    });
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
