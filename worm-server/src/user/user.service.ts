import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { ValidationException } from '../common/exceptions/validation.exception.js';
import { UserRepository } from './user.repository.js';
import { UserDto } from './user.dto.js';
import { UserEntity } from './user.entity.js';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
  ) {}

  private async validateUserInput(
    username: string,
    password: string,
  ): Promise<void> {
    const errors: Record<string, string[]> = {};

    const existing = await this.userRepo.findByUsername(username);
    if (existing) {
      errors['username'] = ['Username already exists'];
    }

    if (!this.isPasswordStrong(password)) {
      errors['password'] = [
        'Password must contain at least 8 characters',
        'Password must contain at least one uppercase letter',
        'Password must contain at least one lowercase letter',
        'Password must contain at least one number',
        'Password must contain at least one special character',
      ];
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(errors);
    }
  }

  async registerUser(
    username: string,
    email: string,
    password: string,
    name?: string,
  ): Promise<UserEntity> {
    await this.validateUserInput(username, password);

    const hashedPassword = await Bun.password.hash(password);

    const user = new UserEntity({
      username: username,
      email: email,
      password: hashedPassword,
      name: name,
      enabled: true,
    });

    return this.userRepo.createUser(user);
  }

  async getCurrentUser(userId: string): Promise<UserEntity | null> {
    return this.userRepo.findById(userId);
  }

  async updateUserDetails(
    userId: string,
    dto: Partial<UserDto>,
  ): Promise<UserEntity> {
    const user = await this.getCurrentUser(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const updates: Partial<UserEntity> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.avatarImageUrl !== undefined) updates.avatarImageUrl = dto.avatarImageUrl;

    return this.userRepo.updateUser(userId, updates);
  }

  async updatePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getCurrentUser(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const passwordMatches = await Bun.password.verify(oldPassword, user.password);
    if (!passwordMatches) {
      throw new BadRequestException('Old password is incorrect');
    }

    if (!this.isPasswordStrong(newPassword)) {
      throw new ValidationException({
        newPassword: [
          'Password must contain at least 8 characters',
          'Password must contain at least one uppercase letter',
          'Password must contain at least one lowercase letter',
          'Password must contain at least one number',
          'Password must contain at least one special character',
        ],
      });
    }

    const hashedPassword = await Bun.password.hash(newPassword);
    await this.userRepo.updateUser(userId, { password: hashedPassword });
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.userRepo.delete(userId);
  }

  async findByGithubId(githubId: string): Promise<UserEntity | null> {
    return this.userRepo.findByGithubId(githubId);
  }

  async createGithubUser(userData: {
    githubId: string;
    username: string;
    email: string;
    name?: string;
    avatarImageUrl?: string;
  }): Promise<UserEntity> {
    // Check if username already exists
    const existingUser = await this.userRepo.findByUsername(userData.username);

    if (existingUser) {
      // If username exists, append a unique identifier
      userData.username = `${userData.username}_${Date.now()}`;
    }

    const user = new UserEntity({
      username: userData.username,
      email: userData.email,
      name: userData.name || null,
      avatarImageUrl: userData.avatarImageUrl || null,
      githubId: userData.githubId,
      enabled: true,
      password: null, // GitHub users don't have a local password
    });

    return this.userRepo.createUser(user);
  }

  private isPasswordStrong(password: string): boolean {
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    return passwordRegex.test(password);
  }

  async checkUsernameAvailability(username: string): Promise<{
    available: boolean;
    suggestions: string[];
  }> {
    const available = await this.userRepo.isUsernameAvailable(username);

    if (available) {
      return {
        available: true,
        suggestions: []
      };
    }

    // Generate suggestions by appending numbers
    const suggestions = Array.from({ length: 3 }, (_, i) =>
      `${username}${i + 1}`
    );

    return {
      available: false,
      suggestions
    };
  }
}
