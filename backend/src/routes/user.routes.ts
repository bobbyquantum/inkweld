import { Hono } from 'hono';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { fileStorageService } from '../services/file-storage.service';
import { imageService } from '../services/image.service';
import { recaptchaService } from '../services/recaptcha.service';
import { config } from '../config/env';
import {
  UserSchema,
  PaginatedUsersResponseSchema,
  UsernameAvailabilityResponseSchema,
} from '../schemas/user.schemas';
import { ErrorResponseSchema, MessageResponseSchema } from '../schemas/common.schemas';
import { RegisterRequestSchema, RegisterResponseSchema } from '../schemas/auth.schemas';

const userRoutes = new Hono();

// Get current user
userRoutes.get(
  '/me',
  describeRoute({
    description: 'Get current authenticated user information',
    tags: ['Users'],
    responses: {
      200: {
        description: 'User information',
        content: {
          'application/json': {
            schema: resolver(UserSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'User not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const userId = c.get('user').id;
    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      id: user.id,
      username: user.username,
      name: user.name,
      enabled: user.enabled,
    });
  }
);

// Get users (paginated)
userRoutes.get(
  '/',
  describeRoute({
    description: 'Get paginated list of users',
    tags: ['Users'],
    responses: {
      200: {
        description: 'Paginated list of users',
        content: {
          'application/json': {
            schema: resolver(PaginatedUsersResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const page = parseInt(c.req.query('page') || '1', 10);
    const pageSize = parseInt(c.req.query('pageSize') || '10', 10);

    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const [users, total] = await userRepo.findAndCount({
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ['id', 'username', 'name', 'enabled'],
    });

    return c.json({
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  }
);

// Search users
userRoutes.get(
  '/search',
  describeRoute({
    description: 'Search users by username or name',
    tags: ['Users'],
    responses: {
      200: {
        description: 'Search results',
        content: {
          'application/json': {
            schema: resolver(PaginatedUsersResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const term = c.req.query('term') || '';
    const page = parseInt(c.req.query('page') || '1', 10);
    const pageSize = parseInt(c.req.query('pageSize') || '10', 10);

    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const queryBuilder = userRepo.createQueryBuilder('user');
    queryBuilder.where('user.username LIKE :term OR user.name LIKE :term', {
      term: `%${term}%`,
    });
    queryBuilder.skip((page - 1) * pageSize);
    queryBuilder.take(pageSize);
    queryBuilder.select(['user.id', 'user.username', 'user.name', 'user.enabled']);

    const [users, total] = await queryBuilder.getManyAndCount();

    return c.json({
      users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  }
);

// Register user
const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  email: z.string().email().optional(),
  name: z.string().optional(),
  captchaToken: z.string().optional(),
});

userRoutes.post(
  '/register',
  describeRoute({
    description: 'Register a new user account (alternative endpoint)',
    tags: ['Users'],
    responses: {
      200: {
        description: 'User registered successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                message: z.string().describe('Success message'),
                userId: z.number().describe('New user ID'),
                username: z.string().describe('Username'),
                name: z.string().describe('Display name'),
                requiresApproval: z.boolean().describe('Whether user requires admin approval'),
              })
            ),
          },
        },
      },
      400: {
        description: 'Username already exists or validation error',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  validator('json', registerSchema),
  async (c) => {
    const { username, email, password, name, captchaToken } = c.req.valid('json');

    // Verify reCAPTCHA if enabled
    if (recaptchaService.isEnabled()) {
      if (!captchaToken) {
        return c.json({ error: 'reCAPTCHA token is required' }, 400);
      }

      const isValid = await recaptchaService.verify(captchaToken);
      if (!isValid) {
        return c.json({ error: 'reCAPTCHA verification failed' }, 400);
      }
    }

    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    // Check if username already exists
    const existingUser = await userRepo.findOne({ where: { username } });
    if (existingUser) {
      return c.json({ error: 'Username already exists' }, 400);
    }

    // Hash password
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = userRepo.create({
      username,
      email,
      password: hashedPassword,
      name: name || username,
      enabled: true,
      approved: !config.userApprovalRequired, // Approved immediately if approval not required
    });

    await userRepo.save(user);

    return c.json({
      message: config.userApprovalRequired
        ? 'User registered successfully. Awaiting admin approval.'
        : 'User registered successfully',
      userId: user.id,
      username: user.username,
      name: user.name,
      requiresApproval: config.userApprovalRequired,
    });
  }
);

// Check username availability
userRoutes.get(
  '/check-username',
  describeRoute({
    description: 'Check if a username is available',
    tags: ['Users'],
    responses: {
      200: {
        description: 'Username availability result',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                available: z.boolean().describe('Whether username is available'),
                suggestions: z.array(z.string()).describe('Alternative username suggestions'),
              })
            ),
          },
        },
      },
      400: {
        description: 'Invalid username',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const username = c.req.query('username');

    if (!username || username.length < 3) {
      return c.json({ error: 'Username must be at least 3 characters' }, 400);
    }

    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const existingUser = await userRepo.findOne({ where: { username } });

    return c.json({
      available: !existingUser,
      suggestions: existingUser ? [`${username}123`, `${username}_new`] : [],
    });
  }
);

// Get user avatar
userRoutes.get(
  '/:username/avatar',
  describeRoute({
    description: 'Get user avatar image',
    tags: ['Users'],
    responses: {
      200: {
        description: 'User avatar image',
        content: {
          'image/png': {
            schema: {
              type: 'string',
              format: 'binary',
            },
          },
        },
      },
      404: {
        description: 'Avatar not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  async (c) => {
    const username = c.req.param('username');

    const hasAvatar = await fileStorageService.hasUserAvatar(username);
    if (!hasAvatar) {
      return c.json({ error: 'Avatar not found' }, 404);
    }

    const buffer = await fileStorageService.getUserAvatar(username);

    // Convert Buffer to Uint8Array for Hono
    const uint8Array = new Uint8Array(buffer);

    return c.body(uint8Array, 200, {
      'Content-Type': 'image/png',
      'Content-Length': buffer.length.toString(),
    });
  }
);

// Upload user avatar
userRoutes.post(
  '/avatar',
  describeRoute({
    description: 'Upload user avatar image',
    tags: ['Users'],
    responses: {
      200: {
        description: 'Avatar uploaded successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                message: z.string().describe('Success message'),
              })
            ),
          },
        },
      },
      400: {
        description: 'Invalid file or no file uploaded',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'User not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const userId = c.get('user').id;
    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user || !user.username) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get the uploaded file
    const body = await c.req.parseBody();
    const file = body['avatar'] as File;

    if (!file) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate image
    const validation = await imageService.validateImage(buffer);
    if (!validation.valid) {
      return c.json({ error: validation.error || 'Invalid image' }, 400);
    }

    // Process avatar
    const processedAvatar = await imageService.processAvatar(buffer);

    // Save avatar
    await fileStorageService.saveUserAvatar(user.username, processedAvatar);

    return c.json({ message: 'Avatar uploaded successfully' });
  }
);

// Delete user avatar
userRoutes.post(
  '/avatar/delete',
  describeRoute({
    description: 'Delete user avatar image',
    tags: ['Users'],
    responses: {
      200: {
        description: 'Avatar deleted successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                message: z.string().describe('Success message'),
              })
            ),
          },
        },
      },
      401: {
        description: 'Not authenticated',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
      404: {
        description: 'User or avatar not found',
        content: {
          'application/json': {
            schema: resolver(ErrorResponseSchema),
          },
        },
      },
    },
  }),
  requireAuth,
  async (c) => {
    const userId = c.get('user').id;
    const dataSource = getDataSource();
    const userRepo = dataSource.getRepository(User);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user || !user.username) {
      return c.json({ error: 'User not found' }, 404);
    }

    const hasAvatar = await fileStorageService.hasUserAvatar(user.username);
    if (!hasAvatar) {
      return c.json({ error: 'Avatar not found' }, 404);
    }

    await fileStorageService.deleteUserAvatar(user.username);

    return c.json({ message: 'Avatar deleted successfully' });
  }
);

export default userRoutes;
