import bcrypt from 'bcrypt';
import { getDataSource } from '../config/database.js';
import { User } from '../entities/user.entity.js';

const SALT_ROUNDS = 10;

class UserService {
  private get repository() {
    return getDataSource().getRepository(User);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.repository.findOne({ where: { username } });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  /**
   * Find user by GitHub ID
   */
  async findByGithubId(githubId: string): Promise<User | null> {
    return this.repository.findOne({ where: { githubId } });
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
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = this.repository.create({
      username: data.username,
      email: data.email,
      password: hashedPassword,
      name: data.name,
      enabled: true,
      approved: false, // Requires admin approval
    });

    return this.repository.save(user);
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
    let user = await this.findByGithubId(data.githubId);

    if (user) {
      // Update existing user
      user.username = data.username;
      user.email = data.email;
      user.name = data.name;
    } else {
      // Create new user
      user = this.repository.create({
        githubId: data.githubId,
        username: data.username,
        email: data.email,
        name: data.name,
        enabled: true,
        approved: false,
      });
    }

    return this.repository.save(user);
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
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.repository.update(userId, { password: hashedPassword });
  }

  /**
   * Approve user (admin only)
   */
  async approveUser(userId: string): Promise<void> {
    await this.repository.update(userId, { approved: true });
  }

  /**
   * Enable/disable user (admin only)
   */
  async setUserEnabled(userId: string, enabled: boolean): Promise<void> {
    await this.repository.update(userId, { enabled });
  }

  /**
   * List all users (admin only)
   */
  async listAll(): Promise<User[]> {
    return this.repository.find({
      order: { username: 'ASC' },
    });
  }

  /**
   * Check if user is approved and enabled
   */
  canLogin(user: User): boolean {
    return user.enabled && user.approved;
  }
}

export const userService = new UserService();
