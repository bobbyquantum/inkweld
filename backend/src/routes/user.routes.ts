import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { requireAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { users as usersTable } from '../db/schema/users';
import { userService } from '../services/user.service';
import { fileStorageService } from '../services/file-storage.service';
import { imageService } from '../services/image.service';
import { like, or } from 'drizzle-orm';
import { UserSchema, PaginatedUsersResponseSchema } from '../schemas/user.schemas';
import { ErrorResponseSchema } from '../schemas/common.schemas';

const userRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to protected routes
userRoutes.use('/me', requireAuth);
userRoutes.use('/avatar', requireAuth);

// Get current user route
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
      description: 'Current user',
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

userRoutes.openapi(getCurrentUserRoute, async (c) => {
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

  return c.json(
    {
      id: user.id,
      username: user.username,
      name: user.name || null,
      email: user.email || undefined,
      enabled: user.enabled,
      approved: user.approved,
    },
    200
  );
});

// Get users route
const getUsersRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Users'],
  operationId: 'listUsers',
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
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '10', 10);

  const db = c.get('db');

  const allUsers = await db
    .select()
    .from(usersTable)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalCount = await db.select().from(usersTable);
  const total = totalCount.length;

  return c.json(
    {
      users: allUsers
        .filter((u): u is typeof u & { username: string } => u.username !== null)
        .map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          enabled: u.enabled,
        })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = parseInt(c.req.query('pageSize') || '10', 10);

  const db = c.get('db');

  const searchTerm = `%${term}%`;
  const foundUsers = await db
    .select()
    .from(usersTable)
    .where(or(like(usersTable.username, searchTerm), like(usersTable.name, searchTerm)))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalResults = await db
    .select()
    .from(usersTable)
    .where(or(like(usersTable.username, searchTerm), like(usersTable.name, searchTerm)));
  const total = totalResults.length;

  return c.json(
    {
      users: foundUsers
        .filter((u): u is typeof u & { username: string } => u.username !== null)
        .map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          enabled: u.enabled,
        })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
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

  return c.json({ message: 'Avatar deleted successfully' }, 200);
});

export default userRoutes;
