import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { configService } from '../services/config.service';
import { config } from '../config/env';
import { type AppContext } from '../types/context';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  OAuthProvidersResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from '../schemas/auth.schemas';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';

const authRoutes = new OpenAPIHono<AppContext>();

// Registration endpoint
const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  tags: ['Authentication'],
  operationId: 'registerUser',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RegisterRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: RegisterResponseSchema,
        },
      },
      description: 'Registration successful',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid input or username already exists',
    },
  },
});

authRoutes.openapi(registerRoute, async (c) => {
  const db = c.get('db');
  const { username, password, email, name } = c.req.valid('json');

  // Check USER_APPROVAL_REQUIRED from database config (set via admin UI)
  // configService reads database first, then environment, then defaults
  const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');

  // Create user with auto-approve based on config
  try {
    const newUser = await userService.create(
      db,
      {
        username,
        password,
        email: email || username + '@local',
        name: name || username,
      },
      { autoApprove: !userApprovalRequired }
    );

    // Auto-login if approval not required
    if (!userApprovalRequired) {
      const token = await authService.createSession(c, newUser);
      return c.json(
        {
          message: 'Registration successful',
          user: {
            id: newUser.id,
            username: newUser.username || '',
            name: newUser.name,
            email: newUser.email || undefined,
            approved: newUser.approved,
            enabled: newUser.enabled,
            hasAvatar: newUser.hasAvatar,
          },
          token,
          requiresApproval: false,
        },
        200
      );
    }

    return c.json(
      {
        message: userApprovalRequired
          ? 'Registration successful. Please wait for admin approval.'
          : 'Registration successful. You can now log in.',
        user: {
          id: newUser.id,
          username: newUser.username || '',
          name: newUser.name,
          email: newUser.email || undefined,
          approved: newUser.approved,
          enabled: newUser.enabled,
          hasAvatar: newUser.hasAvatar,
        },
        requiresApproval: true,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Username already exists' }, 400);
    }
    throw error;
  }
});

// Login endpoint
const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Authentication'],
  operationId: 'login',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: LoginResponseSchema,
        },
      },
      description: 'Login successful',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Invalid credentials',
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

authRoutes.openapi(loginRoute, async (c) => {
  const db = c.get('db');
  const { username, password } = c.req.valid('json');

  // Authenticate user
  const user = await authService.authenticate(db, username, password);

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Check if user can login
  if (!userService.canLogin(user)) {
    if (!user.enabled) {
      return c.json({ error: 'Account is disabled' }, 403);
    }
    if (!user.approved) {
      return c.json({ error: 'Account pending approval' }, 403);
    }
  }

  // Create session and get JWT token
  const token = await authService.createSession(c, user);

  // Return user object with JWT token
  return c.json(
    {
      user: {
        id: user.id,
        username: user.username || '',
        name: user.name,
        email: user.email || undefined,
        approved: user.approved,
        enabled: user.enabled,
        isAdmin: user.isAdmin,
        hasAvatar: user.hasAvatar,
      },
      token, // Return JWT token for client to store
    },
    200
  );
});

// Logout endpoint
const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  tags: ['Authentication'],
  operationId: 'logout',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: MessageResponseSchema,
        },
      },
      description: 'Logout successful',
    },
  },
});

authRoutes.openapi(logoutRoute, async (c) => {
  authService.destroySession(c);
  return c.json({ message: 'Logged out successfully' });
});

// List OAuth providers
const providersRoute = createRoute({
  method: 'get',
  path: '/providers',
  tags: ['Authentication'],
  operationId: 'listOAuthProviders',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: OAuthProvidersResponseSchema,
        },
      },
      description: 'Available OAuth providers',
    },
  },
});

authRoutes.openapi(providersRoute, async (c) => {
  return c.json({
    providers: {
      github: config.github.enabled,
    },
  });
});

export default authRoutes;
