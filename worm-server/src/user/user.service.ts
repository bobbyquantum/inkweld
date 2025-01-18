import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { ValidationException } from '../common/exceptions/validation.exception.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './user.entity.js';
import { UserDto } from './user.dto.js';

@Injectable()
export class UserService {
  private readonly SALT_ROUNDS = 10; // for bcrypt

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private async validateUserInput(
    username: string,
    password: string,
  ): Promise<void> {
    const errors: Record<string, string[]> = {};

    const existing = await this.userRepo.findOne({
      where: { username: username },
    });
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

    const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = this.userRepo.create({
      username: username,
      email: email,
      password: hashedPassword,
      name: name,
      enabled: true,
    });

    return this.userRepo.save(user);
  }

  async getCurrentUser(userId: string): Promise<UserEntity | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      return null;
    }
    return user;
  }

  async updateUserDetails(
    userId: string,
    dto: Partial<UserDto>,
  ): Promise<UserEntity> {
    const user = await this.getCurrentUser(userId);

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarImageUrl !== undefined)
      user.avatarImageUrl = dto.avatarImageUrl;

    return this.userRepo.save(user);
  }

  async updatePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getCurrentUser(userId);

    const passwordMatches = await bcrypt.compare(oldPassword, user.password);
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

    user.password = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.userRepo.save(user);
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = await this.getCurrentUser(userId);
    await this.userRepo.remove(user);
  }

  async findByGithubId(githubId: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({
      where: { githubId: githubId },
    });
  }

  async createGithubUser(userData: {
    githubId: string;
    username: string;
    email: string;
    name?: string;
    avatarImageUrl?: string;
  }): Promise<UserEntity> {
    // Check if username already exists
    const existingUser = await this.userRepo.findOne({
      where: { username: userData.username },
    });

    if (existingUser) {
      // If username exists, append a unique identifier
      userData.username = `${userData.username}_${Date.now()}`;
    }

    const user = this.userRepo.create({
      username: userData.username,
      email: userData.email,
      name: userData.name || null,
      avatarImageUrl: userData.avatarImageUrl || null,
      githubId: userData.githubId,
      enabled: true,
      password: null, // GitHub users don't have a local password
    });

    return this.userRepo.save(user);
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
    const existing = await this.userRepo.findOne({
      where: { username: username },
    });

    if (!existing) {
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
