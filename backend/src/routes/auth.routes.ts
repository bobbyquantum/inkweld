import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { configService } from '../services/config.service';
import { emailService } from '../services/email.service';
import { welcomeEmail, awaitingApprovalEmail } from '../services/email-templates';
import { getBaseUrl } from '../services/url.service';
import { getPasswordPolicy, validatePassword } from '../services/password-validation.service';
import { type AppContext } from '../types/context';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  OAuthProvidersResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from '../schemas/auth.schemas';
import { errorResponse, MessageResponseSchema } from '../schemas/common.schemas';

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
    400: errorResponse('Invalid input or username already exists'),
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

  // Passwordless mode: when PASSWORD_LOGIN_ENABLED is false the server creates
  // a user row with a NULL password column. The client is then responsible for
  // immediately running the WebAuthn registration ceremony against the
  // returned session — without a passkey the account is unreachable. We
  // explicitly ignore any password supplied in the request body in this mode
  // rather than silently storing it: re-enabling password login later should
  // not retroactively activate stale registration-time passwords.
  const passwordLoginEnabled = await configService.getBoolean(db, 'PASSWORD_LOGIN_ENABLED');

  if (passwordLoginEnabled) {
    if (!password) {
      return c.json({ error: 'Password is required' }, 400);
    }
    // Validate password against configured policy
    const passwordPolicy = await getPasswordPolicy(db);
    const passwordErrors = validatePassword(password, passwordPolicy);
    if (passwordErrors.length > 0) {
      return c.json({ error: passwordErrors[0] }, 400);
    }
  }

  // Block duplicate emails (only for real email addresses, not @local fallbacks)
  if (email) {
    const existingUser = await userService.findByEmail(db, email);
    if (existingUser) {
      return c.json(
        { error: 'Registration failed. Please try a different username or email.' },
        400
      );
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
        password: passwordLoginEnabled ? password : undefined,
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

    // Passwordless mode: the brand-new account has NO credential at all
    // (no password, no passkey). If we don't give the user a way to enrol
    // a passkey before the dialog closes they'll be permanently locked out
    // — admin approval would unlock an account they can't sign into.
    //
    // Mint a 15-minute enrolment-only token (see authService for scope
    // semantics). It can be used to call POST /passkeys/register/start +
    // /finish ONCE, and nothing else; every other middleware rejects the
    // 'enrol' scope outright. The frontend register dialog drives the
    // WebAuthn ceremony before navigating to /approval-pending.
    //
    // Password mode users don't need this — they already have a password
    // they can use to sign in once approved (and add a passkey from
    // settings if they want).
    let enrolmentToken: string | undefined;
    if (!passwordLoginEnabled) {
      enrolmentToken = await authService.createEnrolmentSession(c, userToReturn);
    }

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
        enrolmentToken,
        requiresApproval: true,
      },
      200
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json(
        { error: 'Registration failed. Please try a different username or email.' },
        400
      );
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
    401: errorResponse('Invalid credentials'),
    403: errorResponse(
      'Password login is disabled on this server, or the account is disabled / pending approval'
    ),
  },
});

authRoutes.openapi(loginRoute, async (c) => {
  const db = c.get('db');
  const { username, password } = c.req.valid('json');

  // Hard-gate on PASSWORD_LOGIN_ENABLED. When the operator has chosen a
  // passwordless deployment we refuse password authentication outright
  // rather than silently accepting and then failing on a missing hash —
  // the client should be hiding password UI when the /config/features
  // flag is false, but a defence-in-depth check belongs here too.
  const passwordLoginEnabled = await configService.getBoolean(db, 'PASSWORD_LOGIN_ENABLED');
  if (!passwordLoginEnabled) {
    return c.json(
      {
        error: 'Password login is disabled on this server. Please sign in with a passkey instead.',
      },
      403
    );
  }

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
  const db = c.get('db');
  const githubEnabled = await configService.getBoolean(db, 'GITHUB_ENABLED');
  return c.json({
    providers: {
      github: githubEnabled,
    },
  });
});

export default authRoutes;
