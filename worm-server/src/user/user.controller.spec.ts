import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { UserRegisterDto } from './user-register.dto.js';
import { UserEntity } from './user.entity.js';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;

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
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
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

      const result = await controller.register(registerDto);

      expect(result).toEqual({ message: 'User registered', userId: '2' });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        'New User',
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
      };
      jest
        .spyOn(userService, 'registerUser')
        .mockResolvedValue(mockRegisteredUser);

      const result = await controller.register(registerDto);

      expect(result).toEqual({ message: 'User registered', userId: '2' });
      expect(userService.registerUser).toHaveBeenCalledWith(
        'newuser',
        'new@example.com',
        'password123',
        undefined,
      );
    });

    it('should throw validation error for empty username', async () => {
      const registerDto = {
        username: '',
        email: 'new@example.com',
        password: 'password123',
      };

      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Username is required'));

      await expect(
        controller.register(registerDto as UserRegisterDto),
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

      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Invalid email format'));

      await expect(
        controller.register(registerDto as UserRegisterDto),
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

      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(
          new Error('Password must be at least 8 characters long'),
        );

      await expect(
        controller.register(registerDto as UserRegisterDto),
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

      jest
        .spyOn(userService, 'registerUser')
        .mockRejectedValue(new Error('Registration failed'));

      await expect(controller.register(registerDto)).rejects.toThrow(
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
