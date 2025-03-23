import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ValidationException } from '../common/exceptions/validation.exception.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity.js';
import { UserDto } from './user.dto.js';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  private readonly dataDir: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly configService: ConfigService,
  ) {
    // Get the data directory from environment or use default
    this.dataDir = path.resolve(this.configService.get<string>('DATA_PATH', './data'));

    // Ensure the data directory exists
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private async validateUserInput(
    username: string,
    password: string,
  ): Promise<void> {
    const errors: Record<string, string[]> = {};

    // Validate username format - only allow alphanumeric characters, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors['username'] = ['Username must only contain letters, numbers, underscores, and hyphens'];
    }

    const existing = await this.userRepo.findOne({
      where: { username: username },
    });
    if (existing) {
      errors['username'] = errors['username'] || [];
      errors['username'].push('Username already exists');
    }

    const passwordErrors = this.getPasswordErrors(password);
    if (passwordErrors.length > 0) {
      errors['password'] = passwordErrors;
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationException(errors);
    }
  }

  private getPasswordErrors(password: string): string[] {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must contain at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return errors;
  }

  private isPasswordStrong(password: string): boolean {
    return this.getPasswordErrors(password).length === 0;
  }

  async registerUser(
    username: string,
    email: string,
    password: string,
    name?: string,
  ): Promise<UserEntity> {
    await this.validateUserInput(username, password);

    const hashedPassword = await Bun.password.hash(password);

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

    return this.userRepo.save(user);
  }

  async updatePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getCurrentUser(userId);

    const passwordMatches = await Bun.password.verify(
      oldPassword,
      user.password,
    );
    if (!passwordMatches) {
      throw new BadRequestException('Old password is incorrect');
    }

    if (!this.isPasswordStrong(newPassword)) {
      throw new ValidationException({
        newPassword: this.getPasswordErrors(newPassword),
      });
    }

    user.password = await Bun.password.hash(newPassword);
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
    avatarUrl?: string;
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
      githubId: userData.githubId,
      enabled: true,
      password: null, // GitHub users don't have a local password
    });

    // Save the user
    const savedUser = await this.userRepo.save(user);

    // If avatar URL is provided, download and save it
    if (userData.avatarUrl) {
      try {
        const response = await fetch(userData.avatarUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          await this.saveUserAvatar(userData.username, buffer);
        }
      } catch (error: any) {
        console.error(`Failed to download GitHub avatar: ${error.message}`);
      }
    }

    return savedUser;
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
        suggestions: [],
      };
    }

    // Generate suggestions by appending numbers
    const suggestions = Array.from(
      { length: 3 },
      (_, i) => `${username}${i + 1}`,
    );

    return {
      available: false,
      suggestions,
    };
  }

  async getPagedUsers({
    page,
    pageSize,
  }: {
    page: number;
    pageSize: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const [users, total] = await this.userRepo.findAndCount({
      skip,
      take: pageSize,
    });
    return { users, total };
  }

  async pagedSearchUsers({
    term,
    page,
    pageSize,
  }: {
    term: string;
    page: number;
    pageSize: number;
  }): Promise<{ users: UserEntity[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const [users, total] = await this.userRepo
      .createQueryBuilder('user')
      .where(
        'user.username LIKE :term OR user.name LIKE :term OR user.email LIKE :term',
        { term: `%${term}%` },
      )
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();
    return { users, total };
  }

  /**
   * Returns the filesystem path to the user's avatar image
   */
  getUserAvatarPath(username: string): string {
    const userDir = path.join(this.dataDir, username);
    return path.join(userDir, 'avatar.png');
  }

  /**
   * Checks if a user has an avatar image
   */
  async hasUserAvatar(username: string): Promise<boolean> {
    const avatarPath = this.getUserAvatarPath(username);
    return fs.existsSync(avatarPath);
  }

  /**
   * Saves a user avatar, formatting it to a 460x460 PNG
   */
  async saveUserAvatar(username: string, imageBuffer: Buffer): Promise<void> {
    // Create user directory if it doesn't exist
    const userDir = path.join(this.dataDir, username);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const avatarPath = this.getUserAvatarPath(username);

    // Process image: resize to 460x460 and convert to PNG
    await sharp(imageBuffer)
      .resize(460, 460, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toFile(avatarPath);
  }

  /**
   * Gets the avatar of a user as a readable stream
   */
  async getUserAvatar(username: string): Promise<fs.ReadStream> {
    const avatarPath = this.getUserAvatarPath(username);

    if (!fs.existsSync(avatarPath)) {
      throw new NotFoundException('Avatar not found');
    }

    return fs.createReadStream(avatarPath);
  }

  /**
   * Deletes a user's avatar if it exists
   */
  async deleteUserAvatar(username: string): Promise<void> {
    const avatarPath = this.getUserAvatarPath(username);

    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }
}
