import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { config } from '../config/env';
import { requireAuth } from '../middleware/auth';

const authRoutes = new Hono();

// Login schema
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Login endpoint
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
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
    id: user.id,
    username: user.username,
    name: user.name,
    enabled: user.enabled,
    sessionId: req.session.id,
  });
});

// Logout endpoint
authRoutes.post('/logout', async (c) => {
  const req = c.req.raw as any;

  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return c.json({ message: 'Logout successful' });
});

// Get current user
authRoutes.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json(user);
});

// Get OAuth providers
authRoutes.get('/providers', (c) => {
  const providers: string[] = [];
  if (config.github.enabled) {
    providers.push('github');
  }
  return c.json(providers);
});

// GitHub OAuth routes (placeholder - will implement with passport)
authRoutes.get('/authorization/github', (c) => {
  // Will be implemented with passport GitHub strategy
  return c.redirect('/api/auth/code/github');
});

authRoutes.get('/code/github', (c) => {
  // Will be implemented with passport GitHub strategy callback
  return c.json({ message: 'GitHub OAuth callback' });
});

export default authRoutes;
