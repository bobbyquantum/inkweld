import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { User } from '../entities/user.entity';

const userRoutes = new Hono();

// Get current user
userRoutes.get('/me', requireAuth, async (c) => {
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
});

// Get users (paginated)
userRoutes.get('/', async (c) => {
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
});

// Search users
userRoutes.get('/search', async (c) => {
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
});

// Register user
const registerSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  captchaToken: z.string().optional(),
});

userRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { username, email, password, name } = c.req.valid('json');
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
    approved: false, // Will require approval based on config
  });

  await userRepo.save(user);

  return c.json({
    message: 'User registered successfully',
    userId: user.id,
    username: user.username,
    name: user.name,
    requiresApproval: true,
  });
});

// Check username availability
userRoutes.get('/check-username', async (c) => {
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
});

// Get user avatar (placeholder)
userRoutes.get('/:username/avatar', async (c) => {
  const _username = c.req.param('username');
  // TODO: Implement avatar retrieval
  return c.json({ message: 'Avatar retrieval not yet implemented' }, 404);
});

// Upload user avatar (placeholder)
userRoutes.post('/avatar', requireAuth, async (c) => {
  // TODO: Implement avatar upload
  return c.json({ message: 'Avatar upload not yet implemented' });
});

// Delete user avatar (placeholder)
userRoutes.post('/avatar/delete', requireAuth, async (c) => {
  // TODO: Implement avatar deletion
  return c.json({ message: 'Avatar deletion not yet implemented' });
});

export default userRoutes;
