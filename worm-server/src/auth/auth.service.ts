import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity.js';
import * as bcrypt from 'bcrypt';
import { TypeOrmSessionStore } from './session.store.js';
import type { Request } from 'express';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly userService: UserService,
    private readonly sessionStore: TypeOrmSessionStore,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Partial<UserEntity> | null> {
    const user = await this.userRepo.findOne({ where: { username } });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.enabled) {
      throw new UnauthorizedException('User account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Remove password from returned user object

    const { password: _, ...result } = user;
    return result;
  }

  async login(req: Request, user: Partial<UserEntity>) {
    return new Promise((resolve, reject) => {
      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          return reject(err);
        }

        // Store user information directly on the session as strings
        req.session.userId = user.id?.toString();
        req.session.username = user.username;

        // Optional: Add additional user details
        req.session.userData = {
          name: user.name,
          avatarImageUrl: user.avatarImageUrl,
          enabled: user.enabled,
        };

        // Save the session
        req.session.save((saveErr) => {
          if (saveErr) {
            return reject(saveErr);
          }
          resolve({
            message: 'Login successful',
            user: {
              id: user.id?.toString(),
              username: user.username,
            },
          });
        });
      });
    });
  }

  async logout(req: Request) {
    return new Promise((resolve, reject) => {
      // Destroy the session
      req.session.destroy((err) => {
        if (err) {
          reject(err);
        } else {
          resolve({ message: 'Logout successful' });
        }
      });
    });
  }

  // Additional method for GitHub authentication
  async findOrCreateGithubUser(profile: any) {
    const { id, username, emails, displayName, photos } = profile;

    // Try to find existing user by GitHub ID
    let user = await this.userRepo.findOne({
      where: { githubId: id.toString() },
    });

    // If no user found, create a new GitHub user
    if (!user) {
      user = this.userRepo.create({
        username: username,
        email: emails && emails.length > 0 ? emails[0].value : null,
        name: displayName ?? null,
        githubId: id.toString(),
        avatarImageUrl: photos && photos.length > 0 ? photos[0].value : null,
        enabled: true,
        password: null, // GitHub users don't have a local password
      });

      user = await this.userRepo.save(user);
    }

    return user;
  }
}

// Extend type definitions for express-session to include our custom properties
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
    userData?: {
      name?: string;
      avatarImageUrl?: string;
      enabled?: boolean;
    };
  }
}
