import { Test, TestingModule } from '@nestjs/testing';
import { GithubStrategy } from './github.strategy.js';
import { UserService } from '../user/user.service.js';

describe('GithubStrategy', () => {
  let strategy: GithubStrategy;
  let userService: jest.Mocked<UserService>;

  const mockFullUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: 'https://example.com/avatar.jpg',
    githubId: '12345',
    email: null,
    password: null,
    enabled: true,
  };

  const mockSimplifiedUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: 'https://example.com/avatar.jpg',
    githubId: '12345',
  };

  const mockGithubProfile = {
    id: '12345',
    username: 'testuser',
    displayName: 'Test User',
    emails: [{ value: 'test@example.com' }],
    photos: [{ value: 'https://example.com/avatar.jpg' }],
  };

  beforeEach(async () => {
    // Mock environment variables
    process.env.GITHUB_CLIENT_ID = 'mock-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'mock-client-secret';
    process.env.GITHUB_CALLBACK_URL =
      'http://localhost:8333/oauth2/code/github';

    const mockUserService = {
      findByGithubId: jest.fn(),
      createGithubUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubStrategy,
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    strategy = module.get<GithubStrategy>(GithubStrategy);
    userService = module.get(UserService);

    // Mock logger to avoid console output in tests
    jest.spyOn(strategy['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(strategy['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CALLBACK_URL;
  });

  describe('validate', () => {
    it('should return existing user when found by GitHub ID', async () => {
      userService.findByGithubId.mockResolvedValue(mockFullUser);

      const result = await strategy.validate(
        'token',
        'refresh',
        mockGithubProfile,
      );

      expect(result).toEqual(mockSimplifiedUser);
      expect(userService.findByGithubId).toHaveBeenCalledWith('12345');
      expect(userService.createGithubUser).not.toHaveBeenCalled();
    });

    it('should create new user when GitHub ID not found', async () => {
      userService.findByGithubId.mockResolvedValue(null);
      userService.createGithubUser.mockResolvedValue(mockFullUser);

      const result = await strategy.validate(
        'token',
        'refresh',
        mockGithubProfile,
      );

      expect(result).toEqual(mockSimplifiedUser);
      expect(userService.findByGithubId).toHaveBeenCalledWith('12345');
      expect(userService.createGithubUser).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.jpg',
      });
    });

    it('should handle profile without email and photo', async () => {
      const profileWithoutOptionals = {
        id: '12345',
        username: 'testuser',
        displayName: 'Test User',
      };

      userService.findByGithubId.mockResolvedValue(null);
      userService.createGithubUser.mockResolvedValue(mockFullUser);

      await strategy.validate('token', 'refresh', profileWithoutOptionals);

      expect(userService.createGithubUser).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'testuser',
        email: null,
        name: 'Test User',
        avatarImageUrl: null,
      });
    });

    it('should propagate errors from user service', async () => {
      const error = new Error('Database error');
      userService.findByGithubId.mockRejectedValue(error);

      await expect(
        strategy.validate('token', 'refresh', mockGithubProfile),
      ).rejects.toThrow(error);

      expect(strategy['logger'].error).toHaveBeenCalledWith(
        'GitHub authentication error',
        error,
      );
    });

    it('should log validation attempt', async () => {
      userService.findByGithubId.mockResolvedValue(mockFullUser);

      await strategy.validate('token', 'refresh', mockGithubProfile);

      expect(strategy['logger'].log).toHaveBeenCalledWith(
        'GitHub profile validation',
        'testuser',
      );
    });
  });
});
