import bcrypt from 'bcryptjs';
import { eq, like, or, asc, and } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import { users, User, InsertUser } from '../db/schema';
import { configService } from './config.service';

const SALT_ROUNDS = 10;

export interface PaginatedUsersResult {
  users: User[];
  total: number;
  hasMore: boolean;
}

export interface ListUsersOptions {
  search?: string;
  limit?: number;
  offset?: number;
  /** If true, only return users who are approved AND enabled */
  activeOnly?: boolean;
}

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

    // Use explicit autoApprove option if provided, otherwise check database config
    // configService reads from database first, then environment, then defaults
    const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');
    const shouldAutoApprove = options?.autoApprove ?? !userApprovalRequired;

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
   * Reject/unapprove user (admin only)
   */
  async rejectUser(db: DatabaseInstance, userId: string): Promise<void> {
    await db.update(users).set({ approved: false }).where(eq(users.id, userId));
  }

  /**
   * Enable/disable user (admin only)
   */
  async setUserEnabled(db: DatabaseInstance, userId: string, enabled: boolean): Promise<void> {
    await db.update(users).set({ enabled }).where(eq(users.id, userId));
  }

  /**
   * Set user admin status (admin only)
   */
  async setUserAdmin(db: DatabaseInstance, userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  }

  /**
   * Set user hasAvatar flag
   */
  async setHasAvatar(db: DatabaseInstance, userId: string, hasAvatar: boolean): Promise<void> {
    await db.update(users).set({ hasAvatar }).where(eq(users.id, userId));
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(db: DatabaseInstance, userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  /**
   * List users with pagination and search
   * If activeOnly is true, only returns approved+enabled users (for non-admins)
   */
  async listAll(db: DatabaseInstance, options?: ListUsersOptions): Promise<PaginatedUsersResult> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const search = options?.search?.trim().toLowerCase();
    const activeOnly = options?.activeOnly ?? false;

    // Build base conditions
    const conditions: ReturnType<typeof eq>[] = [];

    // If activeOnly, filter to only approved and enabled users
    if (activeOnly) {
      conditions.push(eq(users.approved, true));
      conditions.push(eq(users.enabled, true));
    }

    // Build query with optional search
    let query = db.select().from(users);

    // Build where clause
    let whereClause: ReturnType<typeof and> | ReturnType<typeof or> | undefined;

    if (search) {
      const searchPattern = `%${search}%`;
      const searchCondition = or(
        like(users.username, searchPattern),
        like(users.email, searchPattern)
      );

      if (conditions.length > 0) {
        // Combine activeOnly conditions with search
        const activeCondition = and(...conditions);
        whereClause = and(activeCondition, searchCondition);
      } else {
        whereClause = searchCondition;
      }
    } else if (conditions.length > 0) {
      whereClause = and(...conditions);
    }

    if (whereClause) {
      query = query.where(whereClause) as typeof query;
    }

    // Get paginated results
    const result = await query.orderBy(asc(users.username)).limit(limit).offset(offset);

    // Get total count with same filters using Drizzle's $count method
    const total = await db.$count(users, whereClause);

    return {
      users: result,
      total,
      hasMore: offset + result.length < total,
    };
  }

  /**
   * List pending users awaiting approval (admin only)
   */
  async listPending(db: DatabaseInstance): Promise<User[]> {
    return db.select().from(users).where(eq(users.approved, false)).orderBy(users.username);
  }

  /**
   * Count total users in the database
   * Used to determine if this is the first user (for first-user-is-admin feature)
   */
  async countUsers(db: DatabaseInstance): Promise<number> {
    return db.$count(users);
  }

  /**
   * Check if user is approved and enabled
   */
  canLogin(user: User): boolean {
    return user.enabled && user.approved;
  }
}

export const userService = new UserService();
