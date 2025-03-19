import { Injectable, BadRequestException } from '@nestjs/common';
import { ValidationException } from '../common/exceptions/validation.exception.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity.js';
import { UserDto } from './user.dto.js';

@Injectable()
export class UserService {
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
}
