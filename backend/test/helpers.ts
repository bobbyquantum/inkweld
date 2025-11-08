import { getDataSource } from '../src/config/database.js';
import { User } from '../src/entities/user.entity.js';
import * as bcrypt from 'bcryptjs';

/**
 * Create a test user with hashed password
 */
export async function createTestUser(
  username: string,
  email: string,
  password: string,
  options: { approved?: boolean; enabled?: boolean } = {}
): Promise<User> {
  const userRepo = getDataSource().getRepository(User);
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = userRepo.create({
    username,
    email,
    password: hashedPassword,
    approved: options.approved ?? true,
    enabled: options.enabled ?? true,
  });

  return await userRepo.save(user);
}

/**
 * Login and get session cookie
 */
export async function loginUser(app: any, username: string, password: string): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const cookie = res.headers.get('set-cookie');
  if (!cookie) {
    throw new Error('No session cookie returned');
  }

  return cookie.split(';')[0];
}

/**
 * Create an authenticated test user and return cookie
 */
export async function createAuthenticatedUser(
  app: any,
  username: string,
  email: string,
  password: string
): Promise<{ user: User; cookie: string }> {
  const user = await createTestUser(username, email, password);
  const cookie = await loginUser(app, username, password);
  return { user, cookie };
}

/**
 * Clean up test users by username pattern
 */
export async function cleanupTestUsers(usernamePattern: string): Promise<void> {
  const userRepo = getDataSource().getRepository(User);
  await userRepo
    .createQueryBuilder()
    .delete()
    .where('username LIKE :pattern', { pattern: `${usernamePattern}%` })
    .execute();
}
