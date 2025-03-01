import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';
import { UserEntity } from './user.entity.js';
import { SessionStore } from './session.store.js';
import type { Request } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly sessionSaveTimeout = 3000; // 3 seconds timeout for session operations

  constructor(
    private readonly userRepo: UserRepository,
    private readonly userService: UserService,
    private readonly sessionStore: SessionStore,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Partial<UserEntity> | null> {
    const user = await this.userRepo.findByUsername(username);

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

  async login(req: Request, user: Partial<UserEntity>) {
    return new Promise((resolve, reject) => {
      // Set timeout to prevent hanging indefinitely
      const timeout = setTimeout(() => {
        this.logger.warn('Session operation timed out, continuing with in-memory session');
        // Force resolve to prevent hanging
        resolve({
          message: 'Login successful (session not saved)',
          user: {
            id: user.id?.toString(),
            username: user.username,
          },
        });
      }, this.sessionSaveTimeout);

      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (timeout) clearTimeout(timeout);

        if (err) {
          this.logger.error('Error regenerating session:', err);
          // Continue with the login process even if session regeneration fails
          this.logger.warn('Proceeding without session regeneration');

          // Try to set session data directly
          req.session.userId = user.id?.toString();
          req.session.username = user.username;
          req.session.userData = {
            name: user.name,
            avatarImageUrl: user.avatarImageUrl,
            enabled: user.enabled,
          };

          // Return success without waiting for session save
          return resolve({
            message: 'Login successful (with session errors)',
            user: {
              id: user.id?.toString(),
              username: user.username,
            },
          });
        }

        // If we got here, session regeneration worked
        try {
          // Store user information directly on the session as strings
          req.session.userId = user.id?.toString();
          req.session.username = user.username;

          // Optional: Add additional user details
          req.session.userData = {
            name: user.name,
            avatarImageUrl: user.avatarImageUrl,
            enabled: user.enabled,
          };
        } catch (sessionErr) {
          this.logger.error('Error setting session data:', sessionErr);
          // Continue without failing
        }

        // Save the session with a new timeout
        const saveTimeout = setTimeout(() => {
          this.logger.warn('Session save timed out, continuing with in-memory session');
          resolve({
            message: 'Login successful (session not saved)',
            user: {
              id: user.id?.toString(),
              username: user.username,
            },
          });
        }, this.sessionSaveTimeout);

        try {
          // Save the session
          req.session.save((saveErr) => {
            clearTimeout(saveTimeout);

            if (saveErr) {
              this.logger.error('Error saving session:', saveErr);
              // Don't fail the login if session save fails
              return resolve({
                message: 'Login successful (with session errors)',
                user: {
                  id: user.id?.toString(),
                  username: user.username,
                },
              });
            }

            resolve({
              message: 'Login successful',
              user: {
                id: user.id?.toString(),
                username: user.username,
              },
            });
          });
        } catch (sessionSaveErr) {
          clearTimeout(saveTimeout);
          this.logger.error('Exception during session save:', sessionSaveErr);

          return reject(err);
        }
      });
    });
  }

  async logout(req: Request) {
    return new Promise((resolve, reject) => {
      // Set timeout to prevent hanging indefinitely
      const timeout = setTimeout(() => {
        this.logger.warn('Session destroy timed out, continuing with logout');
        resolve({ message: 'Logout successful (session not destroyed)' });
      }, this.sessionSaveTimeout);

      try {
        // Destroy the session
        req.session.destroy((err) => {
          clearTimeout(timeout);

          if (err) {
            this.logger.error('Error during session destroy:', err);
            // Resolve anyway to prevent hanging
            resolve({ message: 'Logout completed with errors' });
          } else {
            resolve({ message: 'Logout successful' });
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        this.logger.error('Exception during session destroy:', error);
        resolve({ message: 'Logout completed with errors' });
      }
    });
  }

  // Additional method for GitHub authentication
  async findOrCreateGithubUser(profile: any) {
    const { id, username, emails, displayName, photos } = profile;

    // Try to find existing user by GitHub ID
    let user = await this.userRepo.findByGithubId(id.toString());

    // If no user found, create a new GitHub user
    if (!user) {
      const userData = {
        username: username,
        email: emails && emails.length > 0 ? emails[0].value : null,
        name: displayName ?? null,
        githubId: id.toString(),
        avatarImageUrl: photos && photos.length > 0 ? photos[0].value : null,
        enabled: true,
        password: null, // GitHub users don't have a local password
      };

      user = await this.userRepo.createUser(userData);
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
