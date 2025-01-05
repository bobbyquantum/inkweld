import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRegisterDto } from './user-register.dto';
import { UserEntity } from './user.entity';

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
    it('should register a new user', async () => {
      const registerDto: UserRegisterDto = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'password',
        name: 'New User',
      };
      const mockRegisteredUser: UserEntity = {
        id: '2',
        username: 'newuser',
        name: 'New User',
        email: 'new@example.com',
        password: 'password',
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
        'password',
        'New User',
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
