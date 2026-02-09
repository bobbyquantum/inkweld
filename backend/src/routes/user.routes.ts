import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { userService } from '../services/user.service';
import { fileStorageService } from '../services/file-storage.service';
import { imageService } from '../services/image.service';
import { UserSchema, PaginatedUsersResponseSchema } from '../schemas/user.schemas';
import { ErrorResponseSchema } from '../schemas/common.schemas';
import { authService } from '../services/auth.service';

const userRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to protected routes
// Note: /me uses custom auth handling to return anonymous user instead of 401
userRoutes.use('/me', optionalAuth);
userRoutes.use('/avatar', requireAuth);

// Optional auth for user list and search - admins get full details, others get limited info
// We apply it specifically to these routes to avoid any interference with public routes like /check-username
userRoutes.use('/search', optionalAuth);
// For the root / path of the router (which is /api/v1/users)
userRoutes.use('/', async (c, next) => {
  // Only apply to the exact root path, not subpaths (which are handled by their own definitions)
  if (c.req.path === '/api/v1/users' || c.req.path === '/api/v1/users/') {
    return optionalAuth(c, next);
  }
  await next();
});

// Get current user route
// Returns the authenticated user, or an anonymous user if no auth is present.
// Only returns 401 for invalid/expired tokens (not for missing auth).
const getCurrentUserRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Users'],
  operationId: 'getCurrentUser',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
      description: 'Current user (or anonymous user if not authenticated)',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid or expired token (client should clear credentials)',
    },
    403: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Account disabled or pending approval',
    },
  },
});

// Anonymous user response for unauthenticated requests
const ANONYMOUS_USER = {
  id: '',
  username: 'anonymous',
  name: null,
  enabled: false,
  approved: false,
  isAdmin: false,
  hasAvatar: false,
} as const;

userRoutes.openapi(getCurrentUserRoute, async (c) => {
  const db = c.get('db');

  // Use detailed session check to distinguish no-auth from invalid token
  const sessionResult = await authService.getSessionWithReason(c);

  if (sessionResult.status === 'no-auth') {
    // No auth header present - return anonymous user (not an error)
    return c.json(ANONYMOUS_USER, 200);
  }

  if (sessionResult.status === 'invalid-token' || sessionResult.status === 'expired-token') {
    // Token was provided but is invalid/expired - client should clear credentials
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Token is valid - look up the user
  const user = await userService.findById(db, sessionResult.session.userId);

  if (!user || !user.username) {
    // User no longer exists - treat as invalid token
    return c.json({ error: 'User not found' }, 401);
  }

  // Check if user can log in (approved and enabled)
  if (!userService.canLogin(user)) {
    return c.json({ error: 'Account not approved or disabled' }, 403);
  }

  return c.json(
    {
      id: user.id,
      username: user.username,
      name: user.name || null,
      email: user.email || undefined,
      enabled: user.enabled,
      approved: user.approved,
      isAdmin: user.isAdmin,
      hasAvatar: user.hasAvatar,
    },
    200
  );
});

// ---------------------------------------------------------------------------
// PATCH /me — update current user profile (name, email)
// ---------------------------------------------------------------------------
const UpdateProfileRequestSchema = z
  .object({
    name: z
      .string()
      .max(100)
      .optional()
      .openapi({ description: 'Display name', example: 'John Doe' }),
    email: z
      .string()
      .email()
      .optional()
      .openapi({ description: 'Email address', example: 'john@example.com' }),
  })
  .openapi('UpdateProfileRequest');

const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Users'],
  operationId: 'updateProfile',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateProfileRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
      description: 'Updated user profile',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Duplicate email address',
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

// PATCH /me requires auth — add middleware
userRoutes.use('/me', async (c, next) => {
  // Only intercept PATCH requests for update profile
  if (c.req.method === 'PATCH') {
    return requireAuth(c, next);
  }
  await next();
});

userRoutes.openapi(updateProfileRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');

  if (!user?.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const body = c.req.valid('json');

  // Block duplicate emails when updating email
  if (body.email) {
    const existingUser = await userService.findByEmail(db, body.email);
    if (existingUser && existingUser.id !== user.id) {
      return c.json({ error: 'An account with this email address already exists' }, 400);
    }
  }

  const updated = await userService.updateProfile(db, user.id, body);

  return c.json(
    {
      id: updated.id,
      username: updated.username || '',
      name: updated.name || null,
      email: updated.email || undefined,
      enabled: updated.enabled,
      approved: updated.approved,
      isAdmin: updated.isAdmin,
      hasAvatar: updated.hasAvatar,
    },
    200
  );
});

// Query parameters for user list
const ListUsersQuerySchema = z.object({
  search: z.string().optional().openapi({ description: 'Search by username or email' }),
  limit: z.string().optional().openapi({ description: 'Number of results per page (default: 20)' }),
  offset: z.string().optional().openapi({ description: 'Offset for pagination (default: 0)' }),
});

// Get users route
const getUsersRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Users'],
  operationId: 'listUsers',
  summary: 'List users',
  description:
    'Get a paginated list of users. Admins see all users with full details (including pending/disabled). Regular users only see active (approved+enabled) users with limited info.',
  request: {
    query: ListUsersQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedUsersResponseSchema,
        },
      },
      description: 'Paginated list of users',
    },
  },
});

userRoutes.openapi(getUsersRoute, async (c) => {
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = c.get('db');
  const currentUser = c.get('user');
  const isAdmin = currentUser?.isAdmin ?? false;

  // Use the service with activeOnly for non-admins
  const result = await userService.listAll(db, {
    search,
    limit,
    offset,
    activeOnly: !isAdmin, // Non-admins only see approved+enabled users
  });

  // Format users based on admin status
  const formattedUsers = result.users
    .filter((u): u is typeof u & { username: string } => u.username !== null)
    .map((u) => {
      if (isAdmin) {
        // Admins get full details
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          email: u.email ?? undefined,
          enabled: u.enabled,
          approved: u.approved,
          isAdmin: u.isAdmin,
          hasAvatar: u.hasAvatar,
        };
      } else {
        // Regular users get limited info
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          enabled: u.enabled,
          hasAvatar: u.hasAvatar,
        };
      }
    });

  return c.json(
    {
      users: formattedUsers,
      total: result.total,
      hasMore: result.hasMore,
    },
    200
  );
});

// Search users route
const searchUsersRoute = createRoute({
  method: 'get',
  path: '/search',
  tags: ['Users'],
  operationId: 'searchUsers',
  summary: 'Search users',
  description:
    'Search users by username or name. Admins see all users, regular users only see active users.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedUsersResponseSchema,
        },
      },
      description: 'Search results',
    },
  },
});

userRoutes.openapi(searchUsersRoute, async (c) => {
  const term = c.req.query('term') || '';
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const db = c.get('db');
  const currentUser = c.get('user');
  const isAdmin = currentUser?.isAdmin ?? false;

  // Use the service with activeOnly for non-admins
  const result = await userService.listAll(db, {
    search: term,
    limit,
    offset,
    activeOnly: !isAdmin,
  });

  // Format users based on admin status
  const formattedUsers = result.users
    .filter((u): u is typeof u & { username: string } => u.username !== null)
    .map((u) => {
      if (isAdmin) {
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          email: u.email ?? undefined,
          enabled: u.enabled,
          approved: u.approved,
          isAdmin: u.isAdmin,
          hasAvatar: u.hasAvatar,
        };
      } else {
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          enabled: u.enabled,
          hasAvatar: u.hasAvatar,
        };
      }
    });

  return c.json(
    {
      users: formattedUsers,
      total: result.total,
      hasMore: result.hasMore,
    },
    200
  );
});

// Check username route
const UsernameAvailabilitySchema = z
  .object({
    available: z.boolean().openapi({ example: true, description: 'Whether username is available' }),
    suggestions: z
      .array(z.string())
      .openapi({ example: ['johndoe123', 'johndoe_new'], description: 'Alternative suggestions' }),
  })
  .openapi('UsernameAvailability');

const checkUsernameRoute = createRoute({
  method: 'get',
  path: '/check-username',
  tags: ['Users'],
  operationId: 'checkUsernameAvailability',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UsernameAvailabilitySchema,
        },
      },
      description: 'Username availability',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid username',
    },
  },
});

userRoutes.openapi(checkUsernameRoute, async (c) => {
  const username = c.req.query('username');

  if (!username || username.length < 3) {
    return c.json({ error: 'Username must be at least 3 characters' }, 400);
  }

  const db = c.get('db');
  const existingUser = await userService.findByUsername(db, username);

  return c.json(
    {
      available: !existingUser,
      suggestions: existingUser ? [`${username}123`, `${username}_new`] : [],
    },
    200
  );
});

// Get avatar route
const getAvatarRoute = createRoute({
  method: 'get',
  path: '/:username/avatar',
  tags: ['Users'],
  operationId: 'getUserAvatar',
  request: {
    params: z.object({
      username: z.string().openapi({ description: 'Username' }),
    }),
  },
  responses: {
    200: {
      content: {
        'image/png': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      description: 'User avatar',
    },
    404: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Avatar not found',
    },
  },
});

userRoutes.openapi(getAvatarRoute, async (c) => {
  const username = c.req.param('username');

  const hasAvatar = await fileStorageService.hasUserAvatar(username);
  if (!hasAvatar) {
    return c.json({ error: 'Avatar not found' }, 404);
  }

  const buffer = await fileStorageService.getUserAvatar(username);
  const uint8Array = new Uint8Array(buffer);

  return c.body(uint8Array, 200, {
    'Content-Type': 'image/png',
    'Content-Length': buffer.length.toString(),
  });
});

// Upload avatar route
const MessageSchema = z
  .object({
    message: z
      .string()
      .openapi({ example: 'Avatar uploaded successfully', description: 'Success message' }),
  })
  .openapi('Message');

const uploadAvatarRoute = createRoute({
  method: 'post',
  path: '/avatar',
  tags: ['Users'],
  operationId: 'uploadUserAvatar',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            avatar: z
              .any()
              .openapi({ type: 'string', format: 'binary', description: 'Avatar image file' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Avatar uploaded',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'No file or invalid image',
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

userRoutes.openapi(uploadAvatarRoute, async (c) => {
  const contextUser = c.get('user');
  if (!contextUser) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = contextUser.id;

  const db = c.get('db');
  const user = await userService.findById(db, userId);
  if (!user || !user.username) {
    return c.json({ error: 'User not found' }, 404);
  }

  const body = await c.req.parseBody();
  const file = body['avatar'] as File;

  if (!file) {
    return c.json({ error: 'No file uploaded' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const validation = await imageService.validateImage(buffer);
  if (!validation.valid) {
    return c.json({ error: validation.error || 'Invalid image' }, 400);
  }

  const processedAvatar = await imageService.processAvatar(buffer);
  await fileStorageService.saveUserAvatar(user.username, processedAvatar);
  await userService.setHasAvatar(db, userId, true);

  return c.json({ message: 'Avatar uploaded successfully' }, 200);
});

// Delete avatar route
const deleteAvatarRoute = createRoute({
  method: 'post',
  path: '/avatar/delete',
  tags: ['Users'],
  operationId: 'deleteUserAvatar',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageSchema,
        },
      },
      description: 'Avatar deleted',
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
      description: 'User or avatar not found',
    },
  },
});

userRoutes.openapi(deleteAvatarRoute, async (c) => {
  const contextUser = c.get('user');
  if (!contextUser) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const userId = contextUser.id;

  const db = c.get('db');
  const user = await userService.findById(db, userId);
  if (!user || !user.username) {
    return c.json({ error: 'User not found' }, 404);
  }

  const hasAvatar = await fileStorageService.hasUserAvatar(user.username);
  if (!hasAvatar) {
    return c.json({ error: 'Avatar not found' }, 404);
  }

  await fileStorageService.deleteUserAvatar(user.username);
  await userService.setHasAvatar(db, userId, false);

  return c.json({ message: 'Avatar deleted successfully' }, 200);
});

export default userRoutes;
