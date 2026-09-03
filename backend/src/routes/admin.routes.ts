import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { userService } from '../services/user.service';
import { projectService } from '../services/project.service';
import { getProjectStorageSize } from '../services/storage-size.service';
import { getStorageService } from '../services/storage.service';
import { logger } from '../services/logger.service';
import { emailService } from '../services/email.service';
import { accountApprovedEmail, accountRejectedEmail } from '../services/email-templates';
import { getBaseUrl } from '../services/url.service';
import { mapWithConcurrency } from '../utils/concurrency';
import type { AppContext } from '../types/context';
import type { User } from '../db/schema';
import { errorResponses, MessageResponseSchema } from '../schemas/common.schemas';

// Helper to safely format user response
function formatUserResponse(user: User) {
  return {
    id: user.id,
    username: user.username ?? '',
    email: user.email ?? '',
    approved: user.approved,
    enabled: user.enabled,
    isAdmin: user.isAdmin,
    githubId: user.githubId,
    hasAvatar: user.hasAvatar,
  };
}

// Path parameters schema
const UserIdParamsSchema = z.object({
  userId: z.string().openapi({ example: 'abc-123', description: 'User ID' }),
});

// Response schema for admin user list
const AdminUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  approved: z.boolean(),
  enabled: z.boolean(),
  isAdmin: z.boolean(),
  githubId: z.string().nullable(),
});

const AdminUserListSchema = z.array(AdminUserSchema);

// Create the admin routes app
export const adminRoutes = new OpenAPIHono<AppContext>();

// Apply admin middleware to all routes
adminRoutes.use('*', requireAdmin);

// Routes
const listPendingUsersRoute = createRoute({
  method: 'get',
  path: '/users/pending',
  tags: ['Admin'],
  summary: 'List pending users',
  description: 'Get a list of users awaiting approval (admin only)',
  operationId: 'adminListPendingUsers',
  responses: {
    200: {
      description: 'List of pending users',
      content: {
        'application/json': {
          schema: AdminUserListSchema,
        },
      },
    },
    ...errorResponses.admin,
  },
});

const approveUserRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/approve',
  tags: ['Admin'],
  summary: 'Approve a user',
  description: 'Approve a pending user registration (admin only)',
  operationId: 'adminApproveUser',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User approved',
      content: {
        'application/json': {
          schema: AdminUserSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

const rejectUserRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/reject',
  tags: ['Admin'],
  summary: 'Reject a user',
  description: 'Reject a pending user (sets approved to false)',
  operationId: 'adminRejectUser',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User rejected',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

const enableUserRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/enable',
  tags: ['Admin'],
  summary: 'Enable a user',
  description: 'Enable a disabled user account (admin only)',
  operationId: 'adminEnableUser',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User enabled',
      content: {
        'application/json': {
          schema: AdminUserSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

const disableUserRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/disable',
  tags: ['Admin'],
  summary: 'Disable a user',
  description: 'Disable a user account (admin only)',
  operationId: 'adminDisableUser',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User disabled',
      content: {
        'application/json': {
          schema: AdminUserSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

const setUserAdminRoute = createRoute({
  method: 'post',
  path: '/users/{userId}/set-admin',
  tags: ['Admin'],
  summary: 'Set user admin status',
  description: 'Grant or revoke admin privileges for a user (admin only)',
  operationId: 'adminSetUserAdmin',
  request: {
    params: UserIdParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            isAdmin: z.boolean(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User admin status updated',
      content: {
        'application/json': {
          schema: AdminUserSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/users/{userId}',
  tags: ['Admin'],
  summary: 'Delete a user',
  description: 'Permanently delete a user and all their data (admin only)',
  operationId: 'adminDeleteUser',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User deleted',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

// Route handlers

// List pending users
adminRoutes.openapi(listPendingUsersRoute, async (c) => {
  const db = c.get('db');
  const users = await userService.listPending(db);
  return c.json(users.map(formatUserResponse), 200);
});

// Approve user
adminRoutes.openapi(approveUserRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  await userService.approveUser(db, userId);
  const updatedUser = await userService.findById(db, userId);
  if (!updatedUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Send account approved email (best-effort — awaited so it completes on Workers)
  if (updatedUser.email) {
    const baseUrl = await getBaseUrl(db);
    await emailService.sendEmail(db, {
      ...accountApprovedEmail({
        userName: updatedUser.name || updatedUser.username || 'User',
        loginUrl: baseUrl,
      }),
      to: updatedUser.email,
    });
  }

  return c.json(formatUserResponse(updatedUser), 200);
});

// Reject user
adminRoutes.openapi(rejectUserRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Grab user email before rejection (user may be deleted)
  const rejectedEmail = user.email;
  const rejectedName = user.name || user.username || 'User';

  await userService.rejectUser(db, userId);

  // Send rejection email (best-effort — awaited so it completes on Workers)
  if (rejectedEmail) {
    const baseUrl = await getBaseUrl(db);
    await emailService.sendEmail(db, {
      ...accountRejectedEmail({
        userName: rejectedName,
        instanceUrl: baseUrl,
      }),
      to: rejectedEmail,
    });
  }

  return c.json({ message: 'User rejected' }, 200);
});

// Enable user
adminRoutes.openapi(enableUserRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  await userService.setUserEnabled(db, userId, true);
  const updatedUser = await userService.findById(db, userId);
  if (!updatedUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(formatUserResponse(updatedUser), 200);
});

// Disable user
adminRoutes.openapi(disableUserRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  await userService.setUserEnabled(db, userId, false);
  const updatedUser = await userService.findById(db, userId);
  if (!updatedUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(formatUserResponse(updatedUser), 200);
});

// Set user admin status
adminRoutes.openapi(setUserAdminRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');
  const { isAdmin } = c.req.valid('json');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  await userService.setUserAdmin(db, userId, isAdmin);
  const updatedUser = await userService.findById(db, userId);
  if (!updatedUser) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json(formatUserResponse(updatedUser), 200);
});

// Delete user
adminRoutes.openapi(deleteUserRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  // Check if user exists first
  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Drop the user's background image before the row goes, while we still know
  // the username the storage slot is keyed by.
  if (user.username) {
    try {
      await getStorageService(c.get('storage')).deleteSlotImage('backgrounds', user.username);
    } catch (error) {
      // An orphaned image is not a reason to block the deletion.
      logger.warn('Admin', 'Failed to delete user background during account deletion', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await userService.deleteUser(db, userId);
  return c.json({ message: 'User deleted' }, 200);
});

// ---------------------------------------------------------------------------
// List all projects for a user with approximate storage sizes (admin only)
// ---------------------------------------------------------------------------
const AdminProjectStorageSchema = z
  .object({
    id: z.string().openapi({ description: 'Project id' }),
    slug: z.string().openapi({ description: 'Project slug' }),
    title: z.string().openapi({ description: 'Project title' }),
    dataBytes: z.number().openapi({ description: 'Approximate document/data size in bytes' }),
    mediaBytes: z.number().openapi({ description: 'Approximate media size in bytes' }),
    totalBytes: z.number().openapi({ description: 'dataBytes + mediaBytes' }),
  })
  .openapi('AdminProjectStorage');

const AdminUserProjectsSchema = z
  .object({
    userId: z.string().openapi({ description: 'User id' }),
    username: z.string().openapi({ description: 'User username' }),
    projects: z.array(AdminProjectStorageSchema),
    totalDataBytes: z.number().openapi({ description: 'Sum of dataBytes across projects' }),
    totalMediaBytes: z.number().openapi({ description: 'Sum of mediaBytes across projects' }),
    totalBytes: z.number().openapi({ description: 'Sum of totalBytes across projects' }),
  })
  .openapi('AdminUserProjects');

const listUserProjectsRoute = createRoute({
  method: 'get',
  path: '/users/{userId}/projects',
  tags: ['Admin'],
  summary: "List a user's projects with storage sizes",
  description: 'List every project owned by a user with approximate storage sizes (admin only)',
  operationId: 'adminListUserProjects',
  request: {
    params: UserIdParamsSchema,
  },
  responses: {
    200: {
      description: 'User projects with storage sizes',
      content: {
        'application/json': {
          schema: AdminUserProjectsSchema,
        },
      },
    },
    ...errorResponses.adminEntity('User'),
  },
});

adminRoutes.openapi(listUserProjectsRoute, async (c) => {
  const db = c.get('db');
  const { userId } = c.req.valid('param');

  const user = await userService.findById(db, userId);
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const username = user.username ?? '';
  const projects = await projectService.findByUserId(db, userId);

  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

  // Bound concurrency so a user with many projects doesn't fan out an
  // unbounded number of storage calculations (each lists media and may page
  // Durable Object storage) at once.
  const sized = await mapWithConcurrency(projects, 5, async (p) => {
    const size = await getProjectStorageSize(
      username,
      p.slug,
      c.get('storage'),
      c.env as never,
      token
    );
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      dataBytes: size.dataBytes,
      mediaBytes: size.mediaBytes,
      totalBytes: size.dataBytes + size.mediaBytes,
    };
  });

  const totalDataBytes = sized.reduce((sum, p) => sum + p.dataBytes, 0);
  const totalMediaBytes = sized.reduce((sum, p) => sum + p.mediaBytes, 0);

  return c.json(
    {
      userId,
      username,
      projects: sized,
      totalDataBytes,
      totalMediaBytes,
      totalBytes: totalDataBytes + totalMediaBytes,
    },
    200
  );
});

export default adminRoutes;
