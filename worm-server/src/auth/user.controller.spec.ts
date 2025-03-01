import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Session } from 'express-session';
import { UserRegisterDto } from './user-register.dto.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthService } from './auth.service.js';
import { ValidationFilter } from '../common/filters/validation.filter.js';
import {
  ValidationPipe,
  INestApplication,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { UserEntity } from './user.entity.js';
interface _MockRequest extends Request {
  session: Session & {
    user?: any;
  };
}

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;
  let authService: AuthService;

  let app: INestApplication;

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
        ValidationFilter,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) => {
          const formattedErrors = errors.reduce((acc, err) => {
            acc[err.property] = Object.values(err.constraints);
            return acc;
          }, {});
          return new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Validation failed',
              errors: formattedErrors,
            },
            HttpStatus.BAD_REQUEST,
          );
        },
      }),
    );
    app.useGlobalFilters(new ValidationFilter());
    await app.init();

    controller = app.get<UserController>(UserController);
    userService = app.get<UserService>(UserService);
    authService = app.get<AuthService>(AuthService);

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
        createdAt: 0,
        updatedAt: 0,
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
        createdAt: 0,
        updatedAt: 0,
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
        name: 'New User',
      });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        'New User',
      );
      expect(authService.login).toHaveBeenCalledWith(
        mockReq,
        mockRegisteredUser,
      );
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
        createdAt: 0,
        updatedAt: 0,
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
        name: null,
      });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        undefined,
      );
      expect(authService.login).toHaveBeenCalledWith(
        mockReq,
        mockRegisteredUser,
      );
    });

    it('should return validation errors for empty username', async () => {
      const registerDto = {
        username: '',
        email: 'new@example.com',
        password: 'password123',
      };

      const mockReq = { session: {} } as _MockRequest;

      try {
        await controller.register(registerDto as UserRegisterDto, mockReq);
      } catch (error) {
        console.log(error);
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Validation failed',
          errors: {
            username: ['Username is required'],
          },
        });
      }
    });

    it('should return validation errors for invalid email format', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'invalid-email',
        password: 'password123',
      };

      const mockReq = { session: {} } as _MockRequest;

      try {
        await controller.register(registerDto as UserRegisterDto, mockReq);
      } catch (error) {
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Validation failed',
          errors: {
            email: ['Invalid email format'],
          },
        });
      }
    });

    it('should return validation errors for short password', async () => {
      const registerDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'short',
      };

      const mockReq = { session: {} } as _MockRequest;

      try {
        await controller.register(registerDto as UserRegisterDto, mockReq);
      } catch (error) {
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Validation failed',
          errors: {
            password: ['Password must be at least 8 characters long'],
          },
        });
      }
    });

    it('should return multiple validation errors', async () => {
      const registerDto = {
        username: '',
        email: 'invalid-email',
        password: 'short',
      };

      const mockReq = { session: {} } as _MockRequest;

      try {
        await controller.register(registerDto as UserRegisterDto, mockReq);
      } catch (error) {
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'Validation failed',
          errors: {
            username: ['Username is required'],
            email: ['Invalid email format'],
            password: ['Password must be at least 8 characters long'],
          },
        });
      }
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
