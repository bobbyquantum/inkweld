import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { userService } from '../services/user.service';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  InternalError,
} from '../errors';
import type { AppContext } from '../types/context';
import {
  ProjectSchema,
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
} from '../schemas/project.schemas';
import {
  ErrorResponseSchema,
  MessageResponseSchema,
  ProjectPathParamsSchema,
} from '../schemas/common.schemas';

const projectRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to all routes
projectRoutes.use('*', requireAuth);

// Get all projects route
const listProjectsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Projects'],
  operationId: 'listUserProjects',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(ProjectSchema),
        },
      },
      description: 'List of user projects',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
  },
});

projectRoutes.openapi(listProjectsRoute, async (c) => {
  const db = c.get('db');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }
  const userId = contextUser.id;

  const projects = await projectService.findByUserId(db, userId);

  return c.json(
    projects.map((p) => ({
      id: p.id,
      version: p.version,
      slug: p.slug,
      title: p.title,
      description: p.description,
      username: p.username,
      coverImage: p.coverImage ?? null,
      createdDate: new Date(p.createdDate).toISOString(),
      updatedDate: new Date(p.updatedDate).toISOString(),
    })),
    200
  );
});

// Get single project route
const getProjectRoute = createRoute({
  method: 'get',
  path: '/:username/:slug',
  tags: ['Projects'],
  operationId: 'getProject',
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
      description: 'Project details',
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

projectRoutes.openapi(getProjectRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError('Access denied');
  }

  return c.json(
    {
      id: project.id,
      version: project.version,
      slug: project.slug,
      title: project.title,
      description: project.description,
      username: project.username,
      coverImage: project.coverImage ?? null,
      createdDate: new Date(project.createdDate).toISOString(),
      updatedDate: new Date(project.updatedDate).toISOString(),
    },
    200
  );
});

// Create project route
const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Projects'],
  operationId: 'createProject',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateProjectRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
      description: 'Project created',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid input or project already exists',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Not authenticated',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'User not found',
    },
  },
});

projectRoutes.openapi(createProjectRoute, async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const { slug, title, description } = CreateProjectRequestSchema.parse(body);
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }
  const userId = contextUser.id;

  const user = await userService.findById(db, userId);
  if (!user || !user.username) {
    throw new NotFoundError('User not found');
  }

  const existing = await projectService.findByUsernameAndSlug(db, user.username, slug);

  if (existing) {
    throw new BadRequestError('Project with this slug already exists');
  }

  const project = await projectService.create(db, {
    slug,
    title,
    description,
    userId,
  });

  return c.json(
    {
      id: project.id,
      version: project.version,
      slug: project.slug,
      title: project.title,
      description: project.description,
      username: user.username,
      coverImage: project.coverImage ?? null,
      createdDate: new Date(project.createdDate).toISOString(),
      updatedDate: new Date(project.updatedDate).toISOString(),
    },
    201
  );
});

// Update project route
const updateProjectRoute = createRoute({
  method: 'put',
  path: '/:username/:slug',
  tags: ['Projects'],
  operationId: 'updateProject',
  request: {
    params: ProjectPathParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: UpdateProjectRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ProjectSchema,
        },
      },
      description: 'Project updated',
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

projectRoutes.openapi(updateProjectRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }
  const userId = contextUser.id;
  const body = await c.req.json();
  const updates = UpdateProjectRequestSchema.parse(body);

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError('Access denied');
  }

  await projectService.update(db, project.id, updates);

  const updated = await projectService.findById(db, project.id);
  if (!updated) {
    throw new InternalError('Failed to update project');
  }

  return c.json(
    {
      id: updated.id,
      version: updated.version,
      slug: updated.slug,
      title: updated.title,
      description: updated.description,
      username: project.username,
      coverImage: updated.coverImage ?? null,
      createdDate: new Date(updated.createdDate).toISOString(),
      updatedDate: new Date(updated.updatedDate).toISOString(),
    },
    200
  );
});

// Delete project route
const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug',
  tags: ['Projects'],
  operationId: 'deleteProject',
  request: {
    params: ProjectPathParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
      description: 'Project deleted',
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

projectRoutes.openapi(deleteProjectRoute, async (c) => {
  const db = c.get('db');
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }
  const userId = contextUser.id;

  const project = await projectService.findByUsernameAndSlug(db, username, slug);

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.userId !== userId) {
    throw new ForbiddenError('Access denied');
  }

  await projectService.delete(db, project.id);

  return c.json({ message: 'Project deleted successfully' }, 200);
});

export default projectRoutes;
