import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
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

  async registerUser(
    username: string,
    email: string,
    password: string,
    name?: string,
  ): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({
      where: { username: username },
    });
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    if (!this.isPasswordStrong(password)) {
      throw new BadRequestException(
        'Password does not meet strength requirements',
      );
    }

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

  async getCurrentUser(userId: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('No current user found');
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
      throw new BadRequestException(
        'New password does not meet strength requirements',
      );
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
}
