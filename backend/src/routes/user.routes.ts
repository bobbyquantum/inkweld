import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { fileStorageService } from '../services/file-storage.service';
import { imageService } from '../services/image.service';

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

// Get user avatar
userRoutes.get('/:username/avatar', async (c) => {
  const username = c.req.param('username');

  const hasAvatar = await fileStorageService.hasUserAvatar(username);
  if (!hasAvatar) {
    return c.json({ error: 'Avatar not found' }, 404);
  }

  const buffer = await fileStorageService.getUserAvatar(username);

  return c.body(buffer, 200, {
    'Content-Type': 'image/png',
    'Content-Length': buffer.length.toString(),
  });
});

// Upload user avatar
userRoutes.post('/avatar', requireAuth, async (c) => {
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
});

// Delete user avatar
userRoutes.post('/avatar/delete', requireAuth, async (c) => {
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
});

export default userRoutes;
