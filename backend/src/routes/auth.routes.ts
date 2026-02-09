import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { configService } from '../services/config.service';
import { emailService } from '../services/email.service';
import { welcomeEmail, awaitingApprovalEmail } from '../services/email-templates';
import { getBaseUrl } from '../services/url.service';
import { getPasswordPolicy, validatePassword } from '../services/password-validation.service';
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

  // Check if email is required
  const requireEmail = await configService.getBoolean(db, 'REQUIRE_EMAIL');
  if (requireEmail && !email) {
    return c.json({ error: 'Email address is required' }, 400);
  }

  // Validate password against configured policy
  const passwordPolicy = await getPasswordPolicy(db);
  const passwordErrors = validatePassword(password, passwordPolicy);
  if (passwordErrors.length > 0) {
    return c.json({ error: passwordErrors[0] }, 400);
  }

  // Block duplicate emails (only for real email addresses, not @local fallbacks)
  if (email) {
    const existingUser = await userService.findByEmail(db, email);
    if (existingUser) {
      return c.json({ error: 'An account with this email address already exists' }, 400);
    }
  }

  // Check if this is the first user - they automatically become admin
  // This enables testing on ephemeral hosts without pre-configured admin credentials
  const userCount = await userService.countUsers(db);
  const isFirstUser = userCount === 0;

  // Create user with auto-approve based on config (or if first user)
  try {
    const newUser = await userService.create(
      db,
      {
        username,
        password,
        email: email || username + '@local',
        name: name || username,
      },
      { autoApprove: isFirstUser || !userApprovalRequired }
    );

    // First user automatically becomes admin
    let userToReturn = newUser;
    if (isFirstUser) {
      await userService.setUserAdmin(db, newUser.id, true);
      // Refetch to get updated isAdmin status
      userToReturn = (await userService.findById(db, newUser.id)) ?? newUser;
    }

    // Auto-login if approval not required OR if this is the first user (first user bypasses approval)
    if (isFirstUser || !userApprovalRequired) {
      const token = await authService.createSession(c, userToReturn);

      // Send welcome email (best-effort — awaited so it completes on Workers)
      const baseUrl = await getBaseUrl(db);
      await emailService.sendEmail(db, {
        ...welcomeEmail({
          userName: userToReturn.name || userToReturn.username || 'User',
          loginUrl: baseUrl,
        }),
        to: userToReturn.email || '',
      });

      return c.json(
        {
          message: isFirstUser
            ? 'Registration successful. You are the first user and have been granted admin privileges.'
            : 'Registration successful',
          user: {
            id: userToReturn.id,
            username: userToReturn.username || '',
            name: userToReturn.name,
            email: userToReturn.email || undefined,
            approved: userToReturn.approved,
            enabled: userToReturn.enabled,
            hasAvatar: userToReturn.hasAvatar,
          },
          token,
          requiresApproval: false,
        },
        200
      );
    }

    // Send awaiting approval email (best-effort — awaited so it completes on Workers)
    const instanceUrl = await getBaseUrl(db);
    await emailService.sendEmail(db, {
      ...awaitingApprovalEmail({
        userName: userToReturn.name || userToReturn.username || 'User',
        instanceUrl,
      }),
      to: userToReturn.email || '',
    });

    return c.json(
      {
        message: 'Registration successful. Please wait for admin approval.',
        user: {
          id: userToReturn.id,
          username: userToReturn.username || '',
          name: userToReturn.name,
          email: userToReturn.email || undefined,
          approved: userToReturn.approved,
          enabled: userToReturn.enabled,
          hasAvatar: userToReturn.hasAvatar,
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
