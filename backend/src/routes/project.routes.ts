import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { userService } from '../services/user.service';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../types/context';
import {
  ProjectSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  ProjectsListResponseSchema,
} from '../schemas/project.schemas';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';

const projectRoutes = new Hono<AppContext>();

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
    const db = c.get('db');
    const userId = c.get('user').id;

    const projects = await projectService.findByUserId(db, userId);

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
    const db = c.get('db');
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;

    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    // Check if user owns this project
    if (project.userId !== userId) {
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
      username: project.username, // Flat, not nested
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
    const db = c.get('db');
    const { slug, title, description } = c.req.valid('json');
    const userId = c.get('user').id;

    // Get user
    const user = await userService.findById(db, userId);
    if (!user || !user.username) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    // Check if project with same slug exists for this user
    const existing = await projectService.findByUsernameAndSlug(db, user.username, slug);

    if (existing) {
      throw new HTTPException(400, { message: 'Project with this slug already exists' });
    }

    // Create project
    const project = await projectService.create(db, {
      slug,
      title,
      description,
      userId,
    });

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
    const db = c.get('db');
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;
    const updates = c.req.valid('json');

    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    // Check ownership
    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    // Update project
    await projectService.update(db, project.id, updates);

    // Get updated project
    const updated = await projectService.findById(db, project.id);
    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to update project' });
    }

    // Return flat structure matching old NestJS server
    return c.json({
      id: updated.id,
      version: updated.version,
      slug: updated.slug,
      title: updated.title,
      description: updated.description,
      createdDate: updated.createdDate,
      updatedDate: updated.updatedDate,
      username: project.username, // Flat, not nested
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
    const db = c.get('db');
    const username = c.req.param('username');
    const slug = c.req.param('slug');
    const userId = c.get('user').id;

    const project = await projectService.findByUsernameAndSlug(db, username, slug);

    if (!project) {
      throw new HTTPException(404, { message: 'Project not found' });
    }

    // Check ownership
    if (project.userId !== userId) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    await projectService.delete(db, project.id);

    return c.json({ message: 'Project deleted successfully' });
  }
);

export default projectRoutes;
