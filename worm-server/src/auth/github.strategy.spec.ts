import { Test, TestingModule } from '@nestjs/testing';
import { GithubStrategy } from './github.strategy.js';
import { UserService } from './user.service.js';
import { UserEntity } from './user.entity.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
describe('GithubStrategy', () => {
  let strategy: GithubStrategy;
  let userService: jest.Mocked<UserService>;

  const mockFullUser: UserEntity = {
    id: 'github-12345',
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: 'https://example.com/avatar.jpg',
    githubId: '12345',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    email: null,
    password: null,
    enabled: true,
  };

  const expectedUserDTO = {
    id: 'github-12345',
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: 'https://example.com/avatar.jpg',
    githubId: '12345'
  };

  const mockGithubProfile = {
    id: '12345',
    username: 'testuser',
    displayName: 'Test User',
    emails: [{ value: 'test@example.com' }],
    photos: [{ value: 'https://example.com/avatar.jpg' }],
  };

  describe('initialization', () => {
    it('should throw error when GITHUB_ENABLED is false', async () => {
      console.log('[TEST SETUP] Pre-env:', process.env.GITHUB_ENABLED);
      process.env.GITHUB_ENABLED = 'false';
      console.log('[TEST SETUP] Post-env:', process.env.GITHUB_ENABLED);
      process.env.GITHUB_CLIENT_ID = 'mock-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'mock-client-secret';

      await expect(
        Test.createTestingModule({
          providers: [
            GithubStrategy,
            {
              provide: UserService,
              useValue: {
                findByGithubId: jest.fn(),
                createGithubUser: jest.fn(),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('GitHub authentication is disabled');
    });

    it('should throw error when GITHUB_ENABLED is not set', async () => {
      delete process.env.GITHUB_ENABLED;
      process.env.GITHUB_CLIENT_ID = 'mock-client-id';
      process.env.GITHUB_CLIENT_SECRET = 'mock-client-secret';

      await expect(
        Test.createTestingModule({
          providers: [
            GithubStrategy,
            {
              provide: UserService,
              useValue: {
                findByGithubId: jest.fn(),
                createGithubUser: jest.fn(),
              },
            },
          ],
        }).compile(),
      ).rejects.toThrow('GitHub authentication is disabled');
    });

    it('should initialize when GITHUB_ENABLED is true', async () => {
      process.env.GITHUB_ENABLED = 'true';
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
      jest
        .spyOn(strategy['logger'], 'error')
        .mockImplementation(() => undefined);

      expect(strategy).toBeDefined();
      console.log('[INIT TEST] Strategy initialized successfully');
    });
  });

  beforeEach(async () => {
    // Mock environment variables
    process.env.GITHUB_ENABLED = 'true';
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
      console.log('[VALIDATE TEST] Env:', process.env.GITHUB_ENABLED);
      userService.findByGithubId.mockResolvedValue(mockFullUser);

      const result = await strategy.validate(
        'token',
        'refresh',
        mockGithubProfile
      );

      expect(result).toEqual(expectedUserDTO);
      expect(userService.findByGithubId).toHaveBeenCalledWith('12345');
      expect(userService.createGithubUser).not.toHaveBeenCalled();
    });

    it('should create new user when GitHub ID not found', async () => {
      userService.findByGithubId.mockResolvedValue(null);
      userService.createGithubUser.mockResolvedValue(mockFullUser);

      const result = await strategy.validate(
        'token',
        'refresh',
        mockGithubProfile
      );

      expect(result).toEqual(expectedUserDTO);
      expect(userService.findByGithubId).toHaveBeenCalledWith('12345');
      expect(userService.createGithubUser).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.jpg'
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

      await strategy.validate('token', 'refresh', profileWithoutOptionals as any);

      expect(userService.createGithubUser).toHaveBeenCalledWith({
        githubId: '12345',
        username: 'testuser',
        email: null,
        name: 'Test User',
        avatarImageUrl: null,
      });
    });

    it('should return fallback user when user service throws errors', async () => {
      const error = new Error('Database error');
      userService.findByGithubId.mockRejectedValue(error);

      // Also mock the warn logger to verify it's called
      jest.spyOn(strategy['logger'], 'warn').mockImplementation(() => undefined);

      // Strategy should return fallback user instead of propagating error
      const result = await strategy.validate('token', 'refresh', mockGithubProfile);

      // Verify fallback user was returned
      expect(result).toEqual({
        id: `github-12345`,
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.jpg',
        githubId: '12345',
      });

      // The implementation uses warn instead of error for findByGithubId errors
      expect(strategy['logger'].warn).toHaveBeenCalledWith(
        `Error finding GitHub user 12345: ${error.message}`
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
