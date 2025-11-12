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
} from '../schemas/auth.schemas.js';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas.js';

const authRoutes = new Hono<AppContext>();

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
