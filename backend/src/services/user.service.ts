import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import { users, User, InsertUser } from '../db/schema';
import { config } from '../config/env.js';

const SALT_ROUNDS = 10;

class UserService {
  /**
   * Find user by ID
   */
  async findById(db: DatabaseInstance, id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find user by username
   */
  async findByUsername(db: DatabaseInstance, username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  /**
   * Find user by email
   */
  async findByEmail(db: DatabaseInstance, email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  /**
   * Find user by GitHub ID
   */
  async findByGithubId(db: DatabaseInstance, githubId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0];
  }

  /**
   * Create a new user with username/password
   * @param db Database instance
   * @param data User data
   * @param options Additional options like skipApproval
   */
  async create(
    db: DatabaseInstance,
    data: {
      username: string;
      email: string;
      password: string;
      name?: string;
    },
    options?: {
      /** Override the default approval behavior. If true, user is auto-approved. */
      autoApprove?: boolean;
    }
  ): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Use explicit autoApprove option if provided, otherwise fallback to config
    const shouldAutoApprove = options?.autoApprove ?? !config.userApprovalRequired;

    const id = crypto.randomUUID();
    const newUser: InsertUser = {
      id,
      username: data.username,
      email: data.email,
      password: hashedPassword,
      name: data.name || null,
      enabled: true,
      approved: shouldAutoApprove,
    };

    await db.insert(users).values(newUser);

    // Return the created user
    const created = await this.findById(db, id);
    if (created === undefined) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  /**
   * Create or update GitHub user
   */
  async createOrUpdateGithubUser(
    db: DatabaseInstance,
    data: {
      githubId: string;
      username: string;
      email: string;
      name: string;
    }
  ): Promise<User> {
    const user = await this.findByGithubId(db, data.githubId);

    if (user) {
      // Update existing user
      await db
        .update(users)
        .set({
          username: data.username,
          email: data.email,
          name: data.name,
        })
        .where(eq(users.id, user.id));

      const updated = await this.findById(db, user.id);
      if (!updated) {
        throw new Error('Failed to update user');
      }
      return updated;
    } else {
      // Create new user
      const id = crypto.randomUUID();
      const newUser: InsertUser = {
        id,
        githubId: data.githubId,
        username: data.username,
        email: data.email,
        name: data.name,
        enabled: true,
        approved: false,
      };

      await db.insert(users).values(newUser);

      const created = await this.findById(db, id);
      if (created === undefined) {
        throw new Error('Failed to create user');
      }
      return created;
    }
  }

  /**
   * Validate user password
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) {
      return false;
    }
    return bcrypt.compare(password, user.password);
  }

  /**
   * Update user password
   */
  async updatePassword(db: DatabaseInstance, userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  /**
   * Approve user (admin only)
   */
  async approveUser(db: DatabaseInstance, userId: string): Promise<void> {
    await db.update(users).set({ approved: true }).where(eq(users.id, userId));
  }

  /**
   * Enable/disable user (admin only)
   */
  async setUserEnabled(db: DatabaseInstance, userId: string, enabled: boolean): Promise<void> {
    await db.update(users).set({ enabled }).where(eq(users.id, userId));
  }

  /**
   * List all users (admin only)
   */
  async listAll(db: DatabaseInstance): Promise<User[]> {
    return db.select().from(users).orderBy(users.username);
  }

  /**
   * Check if user is approved and enabled
   */
  canLogin(user: User): boolean {
    return user.enabled && user.approved;
  }
}

export const userService = new UserService();
