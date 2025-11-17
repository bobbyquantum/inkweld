import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { config } from '../config/env.js';
import { type AppContext } from '../types/context.js';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  OAuthProvidersResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from '../schemas/auth.schemas.js';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas.js';

const authRoutes = new Hono<AppContext>();

// Registration endpoint
authRoutes.post(
  '/register',
  describeRoute({
    description: 'Register a new user account',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Registration successful',
        content: {
          'application/json': {
            schema: resolver(RegisterResponseSchema),
          },
        },
      },
      400: {
        description: 'Invalid input or username already exists',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'reCAPTCHA validation failed',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  validator('json', RegisterRequestSchema),
  async (c) => {
    const db = c.get('db');
    const { username, password, email, name } = c.req.valid('json');

    // Create user
    try {
      const newUser = await userService.create(db, {
        username,
        password,
        email: email || username + '@local',
        name: name || username,
      });

      // Auto-login if approval not required
      if (!config.userApprovalRequired) {
        const token = await authService.createSession(c, newUser);
        return c.json({
          message: 'Registration successful',
          user: {
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            enabled: newUser.enabled,
          },
          token,
          requiresApproval: false,
        });
      }

      return c.json({
        message: config.userApprovalRequired
          ? 'Registration successful. Please wait for admin approval.'
          : 'Registration successful. You can now log in.',
        user: {
          id: newUser.id,
          username: newUser.username,
          name: newUser.name,
          enabled: newUser.enabled,
        },
        requiresApproval: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        return c.json({ error: 'Username already exists' }, 400);
      }
      throw error;
    }
  }
);

// Login endpoint
authRoutes.post(
  '/login',
  describeRoute({
    description: 'Log in with username and password',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: resolver(LoginResponseSchema),
          },
        },
      },
      401: {
        description: 'Invalid credentials',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      403: {
        description: 'Account disabled or pending approval',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  validator('json', LoginRequestSchema),
  async (c) => {
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

    console.log('[Login] Session created for user:', user.username);

    // Return user object with JWT token
    return c.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        enabled: user.enabled,
      },
      token, // Return JWT token for client to store
    });
  }
);

// Logout endpoint
authRoutes.post(
  '/logout',
  describeRoute({
    description: 'Log out and end session',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Logout successful',
        content: {
          'application/json': {
            schema: resolver(MessageResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    authService.destroySession(c);
    return c.json({ message: 'Logged out successfully' });
  }
);

// List OAuth providers
authRoutes.get(
  '/providers',
  describeRoute({
    description: 'List available OAuth providers',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Available OAuth providers',
        content: {
          'application/json': {
            schema: resolver(OAuthProvidersResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    return c.json({
      providers: {
        github: config.github.enabled,
      },
    });
  }
);

// GitHub OAuth endpoints will be added using @hono/oauth-providers
// TODO: Implement GitHub OAuth with @hono/oauth-providers/github

export default authRoutes;
