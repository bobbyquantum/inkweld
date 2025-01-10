import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Session } from 'express-session';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { UserRegisterDto } from './user-register.dto.js';
import { UserEntity } from './user.entity.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthService } from '../auth/auth.service.js';

interface _MockRequest extends Request {
  session: Session & {
    user?: any;
  };
}

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            getCurrentUser: jest.fn(),
            registerUser: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockImplementation((req: _MockRequest, user) => {
              req.session.user = user;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /api/v1/users/me', () => {
    it('should return current user profile when user exists', async () => {
      const mockUser: UserEntity = {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        password: 'password',
        githubId: null,
        enabled: true,
        avatarImageUrl: 'http://example.com/avatar.jpg',
      };
      jest.spyOn(userService, 'getCurrentUser').mockResolvedValue(mockUser);

      const result = await controller.getMe({ user: { id: '1' } });

      expect(result).toEqual({
        id: '1',
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'http://example.com/avatar.jpg',
        enabled: true,
      });
      expect(userService.getCurrentUser).toHaveBeenCalledWith('1');
    });

    it('should throw an error when user is not found', async () => {
      jest
        .spyOn(userService, 'getCurrentUser')
        .mockRejectedValue(new Error('User not found'));

      await expect(
        controller.getMe({ user: { id: 'nonexistent' } }),
      ).rejects.toThrow('User not found');

      expect(userService.getCurrentUser).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('POST /api/v1/users/register', () => {
    it('should register a new user with all valid fields', async () => {
      const registerDto: UserRegisterDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
      };
      const mockRegisteredUser: UserEntity = {
        id: '2',
        username: 'newuser',
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
        githubId: null,
        enabled: true,
        avatarImageUrl: null,
      };
      jest
        .spyOn(userService, 'registerUser')
        .mockResolvedValue(mockRegisteredUser);

      const mockReq = { session: {} } as _MockRequest;
      const result = await controller.register(registerDto, mockReq);

      expect(result).toEqual({
        message: 'User registered and logged in',
        userId: '2',
        username: 'newuser',
        name: 'New User'
      });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        'New User',
      );
      expect(authService.login).toHaveBeenCalledWith(mockReq, mockRegisteredUser);
    });

    it('should register a new user without optional name field', async () => {
      const registerDto: UserRegisterDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      };
      const mockRegisteredUser: UserEntity = {
        id: '2',
        username: 'newuser',
        name: null,
        email: 'new@example.com',
        password: 'password123',
        githubId: null,
        enabled: true,
        avatarImageUrl: null,
      };
      jest
        .spyOn(userService, 'registerUser')
        .mockResolvedValue(mockRegisteredUser);

      const mockReq = { session: {} } as _MockRequest;
      const result = await controller.register(registerDto, mockReq);

      expect(result).toEqual({
        message: 'User registered and logged in',
        userId: '2',
        username: 'newuser',
        name: null
      });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        undefined,
      );
      expect(authService.login).toHaveBeenCalledWith(mockReq, mockRegisteredUser);
    });

    it('should throw validation error for empty username', async () => {
      const registerDto = {
        username: '',
        email: 'new@example.com',
        password: 'password123',
      };

      const mockReq = { session: {} } as _MockRequest;
      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Username is required'));

      await expect(
        controller.register(registerDto as UserRegisterDto, mockReq),
      ).rejects.toThrow('Username is required');

      expect(userService.registerUser).toHaveBeenCalledWith(
        '',
        'new@example.com',
        'password123',
        undefined,
      );
    });

    it('should throw validation error for invalid email format', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'invalid-email',
        password: 'password123',
      };

      const mockReq = { session: {} } as _MockRequest;
      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Invalid email format'));

      await expect(
        controller.register(registerDto as UserRegisterDto, mockReq),
      ).rejects.toThrow('Invalid email format');

      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'invalid-email',
        'password123',
        undefined,
      );
    });

    it('should throw validation error for short password', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'short',
      };

      const mockReq = { session: {} } as _MockRequest;
      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(
          new Error('Password must be at least 8 characters long'),
        );

      await expect(
        controller.register(registerDto as UserRegisterDto, mockReq),
      ).rejects.toThrow('Password must be at least 8 characters long');

      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'short',
        undefined,
      );
    });

    it('should throw error when user service fails', async () => {
      const registerDto: UserRegisterDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
      };

      const mockReq = { session: {} } as _MockRequest;
      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Registration failed'));

      await expect(controller.register(registerDto, mockReq)).rejects.toThrow(
        'Registration failed',
      );
    });
  });

  describe('GET /api/v1/users/oauth2-providers', () => {
    it('should return available OAuth2 providers', () => {
      const result = controller.getOAuthProviders();
      expect(result).toEqual(['github']);
    });
  });
});
