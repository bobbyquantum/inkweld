import bcrypt from 'bcrypt';
import { eq, or } from 'drizzle-orm';
import { getDatabase } from '../db';
import { users, User, InsertUser } from '../db/schema';

const SALT_ROUNDS = 10;

class UserService {
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | undefined> {
    const db = getDatabase();
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | undefined> {
    const db = getDatabase();
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const db = getDatabase();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  /**
   * Find user by GitHub ID
   */
  async findByGithubId(githubId: string): Promise<User | undefined> {
    const db = getDatabase();
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0];
  }

  /**
   * Create a new user with username/password
   */
  async create(data: {
    username: string;
    email: string;
    password: string;
    name?: string;
  }): Promise<User> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const newUser: InsertUser = {
      id: crypto.randomUUID(),
      username: data.username,
      email: data.email,
      password: hashedPassword,
      name: data.name || null,
      enabled: true,
      approved: false, // Requires admin approval
    };

    await db.insert(users).values(newUser);
    
    // Return the created user
    const created = await this.findById(newUser.id);
    if (!created) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  /**
   * Create or update GitHub user
   */
  async createOrUpdateGithubUser(data: {
    githubId: string;
    username: string;
    email: string;
    name: string;
  }): Promise<User> {
    const db = getDatabase();
    let user = await this.findByGithubId(data.githubId);

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
      
      const updated = await this.findById(user.id);
      if (!updated) {
        throw new Error('Failed to update user');
      }
      return updated;
    } else {
      // Create new user
      const newUser: InsertUser = {
        id: crypto.randomUUID(),
        githubId: data.githubId,
        username: data.username,
        email: data.email,
        name: data.name,
        enabled: true,
        approved: false,
      };

      await db.insert(users).values(newUser);
      
      const created = await this.findById(newUser.id);
      if (!created) {
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
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const db = getDatabase();
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, userId));
  }

  /**
   * Approve user (admin only)
   */
  async approveUser(userId: string): Promise<void> {
    const db = getDatabase();
    await db.update(users).set({ approved: true }).where(eq(users.id, userId));
  }

  /**
   * Enable/disable user (admin only)
   */
  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    const db = getDatabase();
    await db.update(users).set({ enabled }).where(eq(users.id, userId));
  }

  /**
   * List all users (admin only)
   */
  async listAll(): Promise<User[]> {
    const db = getDatabase();
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
