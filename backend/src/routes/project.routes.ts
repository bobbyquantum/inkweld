import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { userService } from '../services/user.service';
import { collaborationService } from '../services/collaboration.service';
import { fileStorageService } from '../services/file-storage.service';
import { yjsService } from '../services/yjs.service';
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
  ProjectRenameRedirectSchema,
  CheckTombstonesRequestSchema,
  CheckTombstonesResponseSchema,
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
      minClientVersion: p.minClientVersion ?? null,
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
    301: {
      content: {
        'application/json': {
          schema: ProjectRenameRedirectSchema,
        },
      },
      description: 'Project was renamed - client should update local storage and redirect',
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
    // Check if this slug was renamed
    const alias = await projectService.findSlugAlias(db, username, slug);
    if (alias) {
      return c.json(
        {
          renamed: true as const,
          oldSlug: slug,
          newSlug: alias.newSlug,
          username,
          renamedAt: new Date(alias.renamedAt).toISOString(),
        },
        301
      );
    }
    throw new NotFoundError('Project not found');
  }

  // Get access level for the user
  const access = await collaborationService.checkAccess(db, project.id, userId);

  // Check if user has read access
  if (!access.canRead) {
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
      minClientVersion: project.minClientVersion ?? null,
      createdDate: new Date(project.createdDate).toISOString(),
      updatedDate: new Date(project.updatedDate).toISOString(),
      access: {
        isOwner: access.isOwner,
        canRead: access.canRead,
        canWrite: access.canWrite,
        canAdmin: access.canAdmin,
        role: access.role,
      },
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

  // Remove any tombstone for this slug (user is recreating a project)
  await projectService.removeTombstone(db, userId, slug);

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
      minClientVersion: project.minClientVersion ?? null,
      createdDate: new Date(project.createdDate).toISOString(),
      updatedDate: new Date(project.updatedDate).toISOString(),
      // Creator is always the owner with full access
      access: {
        isOwner: true,
        canRead: true,
        canWrite: true,
        canAdmin: true,
        role: null,
      },
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

  // Get access level for the user
  const access = await collaborationService.checkAccess(db, project.id, userId);

  // Check if user has admin access (required for project updates)
  if (!access.canAdmin) {
    throw new ForbiddenError('Access denied');
  }

  // Handle slug change (project rename)
  if (updates.slug && updates.slug !== slug) {
    // Check if new slug already exists for this user
    const existing = await projectService.findByUsernameAndSlug(db, username, updates.slug);
    if (existing) {
      throw new BadRequestError('A project with this slug already exists');
    }

    // Rename the project directory on disk
    try {
      await fileStorageService.renameProjectDirectory(username, slug, updates.slug);
    } catch {
      throw new InternalError('Failed to rename project directory');
    }

    // Rename the Yjs documents (LevelDB migration)
    try {
      await yjsService.renameProject(username, slug, updates.slug);
    } catch (error) {
      // Log but don't fail - LevelDB will be recreated on next access
      console.error('Failed to rename LevelDB documents:', error);
    }

    // Create alias for the old slug
    await projectService.createSlugAlias(db, project.userId, slug, updates.slug);

    // Update any existing aliases pointing to the old slug
    await projectService.updateAliasChain(db, project.userId, slug, updates.slug);
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
      minClientVersion: updated.minClientVersion ?? null,
      createdDate: new Date(updated.createdDate).toISOString(),
      updatedDate: new Date(updated.updatedDate).toISOString(),
      access: {
        isOwner: access.isOwner,
        canRead: access.canRead,
        canWrite: access.canWrite,
        canAdmin: access.canAdmin,
        role: access.role,
      },
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

  await projectService.delete(db, project.id, project.userId, project.slug);

  return c.json({ message: 'Project deleted successfully' }, 200);
});

// Check tombstones route - for sync to detect deleted projects
const checkTombstonesRoute = createRoute({
  method: 'post',
  path: '/tombstones/check',
  tags: ['Projects'],
  operationId: 'checkTombstones',
  description:
    'Check if any of the given projects have been deleted. Accepts project keys in username/slug format. Used by clients to detect when local copies should be purged.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CheckTombstonesRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CheckTombstonesResponseSchema,
        },
      },
      description: 'List of tombstones for deleted projects',
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

projectRoutes.openapi(checkTombstonesRoute, async (c) => {
  const db = c.get('db');
  const contextUser = c.get('user');
  if (!contextUser) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { projectKeys } = c.req.valid('json');

  const tombstones = await projectService.findTombstonesByProjectKeys(db, projectKeys);

  return c.json(
    {
      tombstones: tombstones.map((t) => ({
        username: t.username,
        slug: t.slug,
        deletedAt: new Date(t.deletedAt).toISOString(),
      })),
    },
    200
  );
});

export default projectRoutes;
