import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { getDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';
import type { AppContext } from '../types/context.js';

const authRoutes = new Hono<AppContext>();

// Schemas
const registerSchema = z.object({
  username: z.string().min(3).describe('Username (minimum 3 characters)'),
  email: z.string().email().describe('Email address'),
  password: z.string().min(6).describe('Password (minimum 6 characters)'),
});

const loginSchema = z.object({
  username: z.string().min(1).describe('Username'),
  password: z.string().min(1).describe('Password'),
});

const userResponseSchema = z.object({
  id: z.string().describe('User ID'),
  username: z.string().describe('Username'),
  name: z.string().nullable().optional().describe('Display name'),
  email: z.string().optional().describe('Email address'),
  approved: z.boolean().optional().describe('Whether user is approved'),
  enabled: z.boolean().describe('Whether user is enabled'),
});

const registerResponseSchema = z.object({
  message: z.string().describe('Success message'),
  user: userResponseSchema,
});

const loginResponseSchema = z.object({
  message: z.string().describe('Success message'),
  user: userResponseSchema,
  sessionId: z.string().describe('Session ID'),
});

const errorResponseSchema = z.object({
  error: z.string().describe('Error message'),
});

const messageResponseSchema = z.object({
  message: z.string().describe('Message'),
});

const providersResponseSchema = z.array(z.string()).describe('List of enabled OAuth providers');

// Register endpoint
authRoutes.post(
  '/register',
  describeRoute({
    description: 'Register a new user account',
    tags: ['Authentication'],
    responses: {
      201: {
        description: 'User registered successfully',
        content: {
          'application/json': {
            schema: resolver(registerResponseSchema),
          },
        },
      },
      400: {
        description: 'Invalid input or user already exists',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  zValidator('json', registerSchema),
  async (c) => {
    const { username, email, password } = c.req.valid('json');
    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    // Check if username already exists
    const existingUser = await userRepo.findOne({ where: { username } });
    if (existingUser) {
      return c.json({ error: 'Username already taken' }, 400);
    }

    // Check if email already exists
    const existingEmail = await userRepo.findOne({ where: { email } });
    if (existingEmail) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    // Hash password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = userRepo.create({
      username,
      email,
      password: hashedPassword,
      enabled: true,
      approved: !config.userApprovalRequired, // Auto-approve if not required
    });

    await userRepo.save(user);

    return c.json(
      {
        message: config.userApprovalRequired
          ? 'Registration successful. Awaiting admin approval.'
          : 'Registration successful. You can now log in.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          approved: user.approved,
          enabled: user.enabled,
        },
      },
      201
    );
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
            schema: resolver(loginResponseSchema),
          },
        },
      },
      401: {
        description: 'Invalid credentials',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
      403: {
        description: 'Account disabled or pending approval',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  zValidator('json', loginSchema),
  async (c) => {
    const { username, password } = c.req.valid('json');
    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    // Find user by username
    const user = await userRepo.findOne({ where: { username } });

    if (!user || !user.password) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Verify password (using bcrypt - will need to import)
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    if (!user.enabled) {
      return c.json({ error: 'Account is disabled' }, 403);
    }

    if (config.userApprovalRequired && !user.approved) {
      return c.json({ error: 'Account pending approval' }, 403);
    }

    // Set session
    const req = c.req.raw as any;
    req.session.passport = {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        enabled: user.enabled,
      },
    };

    return c.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        enabled: user.enabled,
      },
      sessionId: req.session.id,
    });
  }
);

// Logout endpoint
authRoutes.post(
  '/logout',
  describeRoute({
    description: 'Log out and destroy session',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Logout successful',
        content: {
          'application/json': {
            schema: resolver(messageResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const req = c.req.raw as any;

    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return c.json({ message: 'Logout successful' });
  }
);

// Get current user
authRoutes.get(
  '/me',
  describeRoute({
    description: 'Get currently authenticated user',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'Current user information',
        content: {
          'application/json': {
            schema: resolver(userResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(errorResponseSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const user = c.get('user');
    return c.json(user);
  }
);

// Get OAuth providers
authRoutes.get(
  '/providers',
  describeRoute({
    description: 'Get list of enabled OAuth providers',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'List of enabled OAuth providers',
        content: {
          'application/json': {
            schema: resolver(providersResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    const providers: string[] = [];
    if (config.github.enabled) {
      providers.push('github');
    }
    return c.json(providers);
  }
);

// GitHub OAuth routes (placeholder - will implement with passport)
authRoutes.get(
  '/authorization/github',
  describeRoute({
    description: 'Initiate GitHub OAuth flow (placeholder)',
    tags: ['Authentication'],
    responses: {
      302: {
        description: 'Redirect to GitHub OAuth callback',
      },
    },
  }),
  (c) => {
    // Will be implemented with passport GitHub strategy
    return c.redirect('/api/auth/code/github');
  }
);

authRoutes.get(
  '/code/github',
  describeRoute({
    description: 'GitHub OAuth callback handler (placeholder)',
    tags: ['Authentication'],
    responses: {
      200: {
        description: 'OAuth callback response',
        content: {
          'application/json': {
            schema: resolver(messageResponseSchema),
          },
        },
      },
    },
  }),
  (c) => {
    // Will be implemented with passport GitHub strategy callback
    return c.json({ message: 'GitHub OAuth callback' });
  }
);

export default authRoutes;
