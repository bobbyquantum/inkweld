import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../middleware/auth';
import { userService } from '../services/user.service';
import type { AppContext } from '../types/context';
import type { User } from '../db/schema';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';

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
const listUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  tags: ['Admin'],
  summary: 'List all users',
  description: 'Get a list of all users (admin only)',
  operationId: 'adminListUsers',
  responses: {
    200: {
      description: 'List of users',
      content: {
        'application/json': {
          schema: AdminUserListSchema,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
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
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - Admin access required',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// Route handlers

// List all users
adminRoutes.openapi(listUsersRoute, async (c) => {
  const db = c.get('db');
  const users = await userService.listAll(db);
  return c.json(users.map(formatUserResponse), 200);
});

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

  await userService.rejectUser(db, userId);
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

  await userService.deleteUser(db, userId);
  return c.json({ message: 'User deleted' }, 200);
});

export default adminRoutes;
