import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { MAX_IMAGE_UPLOAD_BYTES, MULTIPART_OVERHEAD_BYTES } from '../utils/upload';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { type AppContext } from '../types/context';
import { userService } from '../services/user.service';
import { isSessionRevoked } from '../utils/session-validity';
import { fileStorageService } from '../services/file-storage.service';
import { imageService } from '../services/image.service';
import { UserSchema, PaginatedUsersResponseSchema } from '../schemas/user.schemas';
import {
  errorResponse,
  errorResponses,
  MessageResponseSchema,
  ProfileVisibilitySchema,
} from '../schemas/common.schemas';
import { authService } from '../services/auth.service';
import { legalService } from '../services/legal.service';
import { accountDeletionService } from '../services/account-deletion.service';

const userRoutes = new OpenAPIHono<AppContext>();

// Apply auth middleware to protected routes
// Note: /me uses custom auth handling to return anonymous user instead of 401
userRoutes.use('/me', optionalAuth);
userRoutes.use('/avatar', requireAuth);
userRoutes.use('/me/policy-acceptance', requireAuth);
// Reject oversized avatar uploads with 413 before parseBody() buffers them.
userRoutes.use(
  '/avatar',
  bodyLimit({ maxSize: MAX_IMAGE_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES })
);

// The user directory (list + search) is for signed-in users: admins get full
// details, everyone else a limited view of active accounts. It used to be
// optionalAuth, which made the directory — and, through the email predicate in
// the search, an existence oracle for any email address — readable by anyone.
// Applied specifically to these routes so public routes like /check-username
// are unaffected.
userRoutes.use('/search', requireAuth);
// For the root / path of the router (which is /api/v1/users)
userRoutes.use('/', async (c, next) => {
  // Only apply to the exact root path, not subpaths (which are handled by their own definitions)
  if (c.req.path === '/api/v1/users' || c.req.path === '/api/v1/users/') {
    return requireAuth(c, next);
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
    401: errorResponse('Invalid or expired token (client should clear credentials)'),
    403: errorResponse('Account disabled or pending approval'),
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

  if (!user?.username) {
    // User no longer exists - treat as invalid token
    return c.json({ error: 'User not found' }, 401);
  }

  if (isSessionRevoked(user, sessionResult.session)) {
    // Issued before a password reset / recovery / admin disable: the client
    // should drop the token exactly as for an expired one.
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Check if user can log in (approved and enabled)
  if (!userService.canLogin(user)) {
    return c.json({ error: 'Account not approved or disabled' }, 403);
  }

  // Derive auth provider from stored credentials
  const hasPassword = !!user.password;
  const hasGithub = !!user.githubId;
  let authProvider: 'local' | 'github' | 'local+github' = 'local';
  if (hasPassword && hasGithub) {
    authProvider = 'local+github';
  } else if (hasGithub) {
    authProvider = 'github';
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
      authProvider,
      bio: user.bio ?? null,
      profileVisibility: user.profileVisibility,
      activityVisibility: user.activityVisibility,
      projectsVisibility: user.projectsVisibility,
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
      .email()
      .optional()
      .openapi({ description: 'Email address', example: 'john@example.com' }),
    bio: z.string().max(500).optional().openapi({
      description: 'Short profile blurb (max 500 chars)',
      example: 'Writes slow-burn fantasy.',
    }),
    profileVisibility: ProfileVisibilitySchema.optional().openapi({
      description: 'Who can see the profile page at all',
    }),
    activityVisibility: ProfileVisibilitySchema.optional().openapi({
      description: 'Who can see the writing activity grid (never wider than profileVisibility)',
    }),
    projectsVisibility: ProfileVisibilitySchema.optional().openapi({
      description: 'Who can see the project list (never wider than profileVisibility)',
    }),
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
    400: errorResponse('Duplicate email address'),
    ...errorResponses.notAuthenticated,
  },
});

// PATCH and DELETE /me require auth — add middleware
userRoutes.use('/me', async (c, next) => {
  // GET /me stays optionalAuth so anonymous visitors get the anonymous user
  if (c.req.method === 'PATCH' || c.req.method === 'DELETE') {
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
      bio: updated.bio ?? null,
      profileVisibility: updated.profileVisibility,
      activityVisibility: updated.activityVisibility,
      projectsVisibility: updated.projectsVisibility,
    },
    200
  );
});

// ---------------------------------------------------------------------------
// DELETE /me — self-service account deletion
// ---------------------------------------------------------------------------
const DeleteAccountRequestSchema = z
  .object({
    confirmUsername: z
      .string()
      .min(1)
      .max(64)
      .openapi({
        description:
          'The account username, typed by the user to confirm. Guards against a ' +
          'stray or scripted request deleting the wrong account.',
        example: 'johndoe',
      }),
  })
  .openapi('DeleteAccountRequest');

const deleteAccountRoute = createRoute({
  method: 'delete',
  path: '/me',
  tags: ['Users'],
  summary: 'Delete my account',
  description:
    'Permanently delete the signed-in account, every project it owns (documents, ' +
    'media and published files) and its profile images, passkeys, grants and ' +
    'comments. Cannot be undone.',
  operationId: 'deleteAccount',
  request: {
    body: { content: { 'application/json': { schema: DeleteAccountRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: MessageResponseSchema } },
      description: 'Account deleted',
    },
    400: errorResponse('confirmUsername does not match the account'),
    ...errorResponses.notAuthenticated,
    409: errorResponse('The last administrator cannot delete their account'),
  },
});

userRoutes.openapi(deleteAccountRoute, async (c) => {
  const db = c.get('db');
  const sessionUser = c.get('user');
  const user = sessionUser?.id ? await userService.findById(db, sessionUser.id) : undefined;
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const { confirmUsername } = c.req.valid('json');
  if (confirmUsername.trim().toLowerCase() !== (user.username ?? '').toLowerCase()) {
    return c.json({ error: 'The username you typed does not match your account' }, 400);
  }

  if (user.isAdmin && (await userService.countActiveAdmins(db)) <= 1) {
    return c.json(
      {
        error:
          'You are the only administrator. Make another user an administrator ' +
          'before deleting your account.',
      },
      409
    );
  }

  await accountDeletionService.deleteAccount(c, user, { destroyDurableObjects: true });
  authService.destroySession(c);
  return c.json({ message: 'Account deleted' }, 200);
});

// ---------------------------------------------------------------------------
// /me/policy-acceptance — has the user accepted the current legal documents?
// ---------------------------------------------------------------------------
const PolicyAcceptanceStatusSchema = z
  .object({
    required: z.boolean().openapi({
      description: 'Whether the instance requires acceptance at all (REQUIRE_POLICY_ACCEPTANCE).',
    }),
    currentVersion: z.string().optional().openapi({
      description: 'SystemFeatures.policyVersion. Absent when no document is configured.',
      example: '3f2a9c0d1b4e5f67',
    }),
    acceptedVersion: z.string().nullable().openapi({
      description: 'The version this user last accepted, or null if never.',
    }),
    acceptedAt: z.number().nullable().openapi({
      description: 'Unix seconds when acceptedVersion was recorded, or null.',
    }),
    needsAcceptance: z.boolean().openapi({
      description: 'True when required and acceptedVersion differs from currentVersion.',
    }),
  })
  .openapi('PolicyAcceptanceStatus');

const getPolicyAcceptanceRoute = createRoute({
  method: 'get',
  path: '/me/policy-acceptance',
  tags: ['Users'],
  operationId: 'getPolicyAcceptance',
  responses: {
    200: {
      content: { 'application/json': { schema: PolicyAcceptanceStatusSchema } },
      description: 'Policy acceptance status for the current user',
    },
    ...errorResponses.notAuthenticated,
  },
});

userRoutes.openapi(getPolicyAcceptanceRoute, async (c) => {
  const db = c.get('db');
  const sessionUser = c.get('user');
  const user = sessionUser?.id ? await userService.findById(db, sessionUser.id) : undefined;
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const legal = await legalService.getLegalState(db);
  return c.json(
    {
      required: legal.requireAcceptance,
      currentVersion: legal.version,
      acceptedVersion: user.policyAcceptedVersion ?? null,
      acceptedAt: user.policyAcceptedAt ?? null,
      needsAcceptance: legalService.needsAcceptance(legal, user.policyAcceptedVersion),
    },
    200
  );
});

const AcceptPolicyRequestSchema = z
  .object({
    version: z.string().max(64).openapi({
      description: 'The policyVersion the user was shown and agreed to.',
      example: '3f2a9c0d1b4e5f67',
    }),
  })
  .openapi('AcceptPolicyRequest');

const acceptPolicyRoute = createRoute({
  method: 'post',
  path: '/me/policy-acceptance',
  tags: ['Users'],
  operationId: 'acceptPolicy',
  request: {
    body: { content: { 'application/json': { schema: AcceptPolicyRequestSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PolicyAcceptanceStatusSchema } },
      description: 'Acceptance recorded',
    },
    400: errorResponse('The version is not the current one (the documents changed)'),
    ...errorResponses.notAuthenticated,
  },
});

userRoutes.openapi(acceptPolicyRoute, async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  if (!user?.id) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  const { version } = c.req.valid('json');
  const legal = await legalService.getLegalState(db);
  // Only the current version can be accepted: if an admin edited the text
  // while the dialog was open, the user must see the new wording first.
  if (!legal.version || version !== legal.version) {
    return c.json(
      { error: 'The privacy policy or terms have changed. Please review them again.' },
      400
    );
  }
  const recorded = await userService.recordPolicyAcceptance(db, user.id, version);
  return c.json(
    {
      required: legal.requireAcceptance,
      currentVersion: legal.version,
      acceptedVersion: recorded.acceptedVersion,
      acceptedAt: recorded.acceptedAt,
      needsAcceptance: false,
    },
    200
  );
});

// Query parameters for user list
const ListUsersQuerySchema = z.object({
  search: z
    .string()
    .optional()
    .openapi({ description: 'Search by username (admins may also match on email)' }),
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
    'Get a paginated list of users. Requires authentication. Admins see all users with full details (including pending/disabled). Regular users only see active (approved+enabled) users with limited info.',
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
    ...errorResponses.notAuthenticated,
  },
});

userRoutes.openapi(getUsersRoute, async (c) => {
  const search = c.req.query('search');
  const rawLimit = Number.parseInt(c.req.query('limit') || '20', 10);
  const rawOffset = Number.parseInt(c.req.query('offset') || '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const db = c.get('db');
  const currentUser = c.get('user');
  const isAdmin = currentUser?.isAdmin ?? false;

  // Use the service with activeOnly for non-admins
  const result = await userService.listAll(db, {
    search,
    limit,
    offset,
    activeOnly: !isAdmin, // Non-admins only see approved+enabled users
    searchEmail: isAdmin, // Email is never a search key for non-admins
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
    'Search users by username. Requires authentication. Admins see all users and may also match on email; regular users only see active users.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: PaginatedUsersResponseSchema,
        },
      },
      description: 'Search results',
    },
    ...errorResponses.notAuthenticated,
  },
});

userRoutes.openapi(searchUsersRoute, async (c) => {
  const term = c.req.query('term') || '';
  const rawLimit = Number.parseInt(c.req.query('limit') || '20', 10);
  const rawOffset = Number.parseInt(c.req.query('offset') || '0', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const db = c.get('db');
  const currentUser = c.get('user');
  const isAdmin = currentUser?.isAdmin ?? false;

  // Use the service with activeOnly for non-admins
  const result = await userService.listAll(db, {
    search: term,
    limit,
    offset,
    activeOnly: !isAdmin,
    searchEmail: isAdmin,
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
    400: errorResponse('Invalid username'),
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
    ...errorResponses.notFound('Avatar'),
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
    400: errorResponse('No file or invalid image'),
    ...errorResponses.notAuthenticated,
    ...errorResponses.notFound('User'),
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
  if (!user?.username) {
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
    ...errorResponses.notAuthenticated,
    404: errorResponse('User or avatar not found'),
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
  if (!user?.username) {
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
