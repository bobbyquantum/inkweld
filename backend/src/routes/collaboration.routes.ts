/**
 * Collaboration Routes
 *
 * REST API for managing project collaborators.
 * Allows project owners to invite users and manage access.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { type CollaboratorRole } from '../db/schema/project-collaborators';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors';
import type { AppContext, DatabaseInstance, User } from '../types/context';

const collaborationRoutes = new OpenAPIHono<AppContext>();

// Apply session auth middleware
collaborationRoutes.use('*', requireAuth);

// ============================================
// Schemas
// ============================================

// Type alias for collaborator data that matches the OpenAPI schema
type CollaboratorData = z.infer<typeof CollaboratorSchema>;

const CollaboratorRoleSchema = z.enum(['viewer', 'editor', 'admin']).openapi('CollaboratorRole');

const InvitationStatusSchema = z
  .enum(['pending', 'accepted', 'declined'])
  .openapi('InvitationStatus');

const CollaboratorSchema = z
  .object({
    projectId: z.string(),
    userId: z.string(),
    username: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    role: CollaboratorRoleSchema,
    status: InvitationStatusSchema,
    invitedBy: z.string().nullable(),
    invitedByUsername: z.string().nullable(),
    invitedAt: z.number(),
    acceptedAt: z.number().nullable(),
    collaboratorType: z.enum(['user', 'oauth_app']).default('user'),
    clientName: z.string().nullable(),
  })
  .openapi('Collaborator');

const InviteCollaboratorRequestSchema = z
  .object({
    username: z.string().min(1).openapi({ description: 'Username of user to invite' }),
    role: CollaboratorRoleSchema.openapi({
      description: 'Role to grant: viewer, editor, or admin',
    }),
  })
  .openapi('InviteCollaboratorRequest');

const UpdateCollaboratorRequestSchema = z
  .object({
    role: CollaboratorRoleSchema.openapi({ description: 'New role to assign' }),
  })
  .openapi('UpdateCollaboratorRequest');

const PendingInvitationSchema = z
  .object({
    projectId: z.string(),
    projectTitle: z.string(),
    projectSlug: z.string(),
    ownerUsername: z.string(),
    role: CollaboratorRoleSchema,
    invitedAt: z.number(),
    invitedByUsername: z.string().nullable(),
  })
  .openapi('PendingInvitation');

const CollaboratedProjectSchema = z
  .object({
    projectId: z.string(),
    projectTitle: z.string(),
    projectSlug: z.string(),
    ownerUsername: z.string(),
    role: CollaboratorRoleSchema,
    acceptedAt: z.number(),
  })
  .openapi('CollaboratedProject');

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi('CollaborationError');

const MessageSchema = z
  .object({
    message: z.string(),
  })
  .openapi('CollaborationMessage');

const ProjectPathParams = z.object({
  username: z.string(),
  slug: z.string(),
});

const CollaboratorPathParams = ProjectPathParams.extend({
  collaboratorId: z.string().openapi({ description: 'User ID of the collaborator' }),
});

const InvitationPathParams = z.object({
  projectId: z.string(),
});

// ============================================
// Helper: Verify project ownership ONLY (for sensitive operations)
// ============================================

async function verifyProjectOwnership(
  db: DatabaseInstance,
  user: User | undefined | null,
  username: string,
  slug: string
): Promise<{ projectId: string }> {
  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const isOwner = project.userId === user.id;

  // Only allow project owner (or system admin)
  if (!isOwner && !user.isAdmin) {
    throw new ForbiddenError('You must be the project owner to perform this action');
  }

  return { projectId: project.id };
}

// ============================================
// Helper: Verify project ownership or admin access (for viewing/inviting)
// ============================================

async function verifyProjectAdminAccess(
  db: DatabaseInstance,
  user: User | undefined | null,
  username: string,
  slug: string
): Promise<{ projectId: string; isOwner: boolean }> {
  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const project = await projectService.findByUsernameAndSlug(db, username, slug);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const isOwner = project.userId === user.id;

  // Check if user has admin access
  if (!isOwner && !user.isAdmin) {
    const access = await collaborationService.checkAccess(db, project.id, user.id);
    if (!access.canAdmin) {
      throw new ForbiddenError(
        'You must be the project owner or an admin collaborator to manage collaborators'
      );
    }
  }

  return { projectId: project.id, isOwner };
}

// ============================================
// Routes
// ============================================

// List all collaborators for a project
const listCollaboratorsRoute = createRoute({
  method: 'get',
  path: '/:username/:slug/collaborators',
  tags: ['Collaboration'],
  operationId: 'listCollaborators',
  request: {
    params: ProjectPathParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(CollaboratorSchema),
        },
      },
      description: 'List of collaborators',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project not found',
    },
  },
});

collaborationRoutes.openapi(listCollaboratorsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug } = c.req.valid('param');

  const { projectId } = await verifyProjectAdminAccess(db, user, username, slug);
  const collaborators = await collaborationService.getCollaborators(db, projectId);

  return c.json(collaborators as CollaboratorData[], 200);
});

// Invite a collaborator
const inviteCollaboratorRoute = createRoute({
  method: 'post',
  path: '/:username/:slug/collaborators',
  tags: ['Collaboration'],
  operationId: 'inviteCollaborator',
  request: {
    params: ProjectPathParams,
    body: {
      content: {
        'application/json': {
          schema: InviteCollaboratorRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: CollaboratorSchema,
        },
      },
      description: 'Invitation created',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid request or user already a collaborator',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project or user not found',
    },
  },
});

collaborationRoutes.openapi(inviteCollaboratorRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug } = c.req.valid('param');
  const { username: targetUsername, role } = c.req.valid('json');

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const { projectId } = await verifyProjectAdminAccess(db, user, username, slug);

  const collaborator = await collaborationService.inviteCollaborator(
    db,
    projectId,
    targetUsername,
    role as CollaboratorRole,
    user.id
  );

  return c.json(collaborator as CollaboratorData, 201);
});

// Update a collaborator's role
const updateCollaboratorRoute = createRoute({
  method: 'patch',
  path: '/:username/:slug/collaborators/:collaboratorId',
  tags: ['Collaboration'],
  operationId: 'updateCollaborator',
  request: {
    params: CollaboratorPathParams,
    body: {
      content: {
        'application/json': {
          schema: UpdateCollaboratorRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CollaboratorSchema,
        },
      },
      description: 'Collaborator updated',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid request',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project or collaborator not found',
    },
  },
});

collaborationRoutes.openapi(updateCollaboratorRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug, collaboratorId } = c.req.valid('param');
  const { role } = c.req.valid('json');

  // Only project owner can change collaborator roles
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  const updated = await collaborationService.updateRole(
    db,
    projectId,
    collaboratorId,
    role as CollaboratorRole
  );

  return c.json(updated as CollaboratorData, 200);
});

// Remove a collaborator
const removeCollaboratorRoute = createRoute({
  method: 'delete',
  path: '/:username/:slug/collaborators/:collaboratorId',
  tags: ['Collaboration'],
  operationId: 'removeCollaborator',
  request: {
    params: CollaboratorPathParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Collaborator removed',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    403: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authorized',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Project or collaborator not found',
    },
  },
});

collaborationRoutes.openapi(removeCollaboratorRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { username, slug, collaboratorId } = c.req.valid('param');

  // Only project owner can remove collaborators
  const { projectId } = await verifyProjectOwnership(db, user, username, slug);

  await collaborationService.removeCollaborator(db, projectId, collaboratorId);

  return c.json({ message: 'Collaborator removed' }, 200);
});

// ============================================
// User-facing invitation routes
// ============================================

// Get my pending invitations
const getPendingInvitationsRoute = createRoute({
  method: 'get',
  path: '/invitations',
  tags: ['Collaboration'],
  operationId: 'getPendingInvitations',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(PendingInvitationSchema),
        },
      },
      description: 'List of pending invitations',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
  },
});

collaborationRoutes.openapi(getPendingInvitationsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const invitations = await collaborationService.getPendingInvitations(db, user.id);
  return c.json(invitations, 200);
});

// Accept an invitation
const acceptInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/:projectId/accept',
  tags: ['Collaboration'],
  operationId: 'acceptInvitation',
  request: {
    params: InvitationPathParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: CollaboratorSchema,
        },
      },
      description: 'Invitation accepted',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invitation already processed',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invitation not found',
    },
  },
});

collaborationRoutes.openapi(acceptInvitationRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = c.req.valid('param');

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const collaborator = await collaborationService.acceptInvitation(db, projectId, user.id);

  return c.json(collaborator as CollaboratorData, 200);
});

// Decline an invitation
const declineInvitationRoute = createRoute({
  method: 'post',
  path: '/invitations/:projectId/decline',
  tags: ['Collaboration'],
  operationId: 'declineInvitation',
  request: {
    params: InvitationPathParams,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Invitation declined',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invitation already processed',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invitation not found',
    },
  },
});

collaborationRoutes.openapi(declineInvitationRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const { projectId } = c.req.valid('param');

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  await collaborationService.declineInvitation(db, projectId, user.id);

  return c.json({ message: 'Invitation declined' }, 200);
});

// Get projects I'm collaborating on
const getCollaboratedProjectsRoute = createRoute({
  method: 'get',
  path: '/collaborated',
  tags: ['Collaboration'],
  operationId: 'getCollaboratedProjects',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(CollaboratedProjectSchema),
        },
      },
      description: 'List of projects user collaborates on',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Not authenticated',
    },
  },
});

collaborationRoutes.openapi(getCollaboratedProjectsRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user) {
    throw new UnauthorizedError('Not authenticated');
  }

  const projects = await collaborationService.getCollaboratedProjects(db, user.id);
  return c.json(projects, 200);
});

export { collaborationRoutes };
