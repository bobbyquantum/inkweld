import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/user.entity.js';
import { TypeOrmSessionStore } from './session.store.js';

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

    const isPasswordValid = await Bun.password.verify(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Remove password from returned user object
    const { password: _, ...result } = user;
    return result;
  }

  async login(req, user: Partial<UserEntity>) {
    return new Promise((resolve, reject) => {
      // Log session configuration for debugging
      console.log('Login attempt - Session info:', {
        sessionId: req.sessionID,
        secure: req.secure,
        protocol: req.protocol,
        headers: req.headers ? {
          'x-forwarded-proto': req.headers['x-forwarded-proto'],
          'x-forwarded-for': req.headers['x-forwarded-for']
        } : 'No headers available',
        nodeEnv: process.env.NODE_ENV
      });

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration failed:', err);
          return reject(err);
        }

        // Store user information directly on the session as strings
        req.session.userId = user.id?.toString();
        req.session.username = user.username;

        // Optional: Add additional user details
        req.session.userData = {
          name: user.name,
          enabled: user.enabled,
        };

        // Save the session
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save failed:', saveErr);
            return reject(saveErr);
          }
          
          console.log('Session saved successfully:', {
            sessionId: req.sessionID,
            userId: user.id?.toString()
          });
          
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

  async logout(req) {
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
        enabled: true,
        password: null, // GitHub users don't have a local password
      });

      user = await this.userRepo.save(user);

      // If photos are available, download and save the avatar
      if (photos && photos.length > 0 && photos[0].value) {
        try {
          const response = await fetch(photos[0].value);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            await this.userService.saveUserAvatar(user.username, buffer);
          }
        } catch (error: any) {
          console.error(`Failed to download GitHub avatar: ${error.message}`);
        }
      }
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
      enabled?: boolean;
    };
  }
}
