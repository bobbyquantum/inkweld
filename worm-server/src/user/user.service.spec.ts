import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { ConfigService } from '@nestjs/config';

// Mock Bun.password methods
jest.spyOn(Bun.password, 'hash').mockImplementation(async (pass) => `hashed_${pass}`);
jest.spyOn(Bun.password, 'verify').mockImplementation(async () => true);

describe('UserLevelDBService', () => {
  let userService: UserService;
  let _userRepository: UserRepository;

  // Create mock for UserLevelDBRepository
  const mockUserRepository = {
    findByUsername: jest.fn<() => any>(),
    findById: jest.fn<() => any>(),
    findByGithubId: jest.fn<() => any>(),
    findOne: jest.fn<() => any>(),
    createUser: jest.fn<() => any>(),
    updateUser: jest.fn<() => any>(),
    delete: jest.fn<() => any>(),
    isUsernameAvailable: jest.fn<() => any>(),
  };

  // Create mock for LevelDBManagerService
  const mockLevelDBManagerService = {
    getProjectDatabase: jest.fn<() => any>(),
    getSystemDatabase: jest.fn<() => any>(),
    getSystemSublevel: jest.fn<() => any>(),
    deleteProjectDatabase: jest.fn<() => any>(),
  };

  // Create mock for ConfigService
  const mockConfigService = {
    get: jest.fn<(key: string) => any>().mockImplementation((key) => {
      if (key === 'Y_DATA_PATH') return './test-data';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mockUserRepository,
        },
        {
          provide: LevelDBManagerService,
          useValue: mockLevelDBManagerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);

    // Reset Bun password mock implementations before each test
    (Bun.password.hash as jest.Mock).mockImplementation(async (pass) => `hashed_${pass}`);
    (Bun.password.verify as jest.Mock).mockImplementation(async () => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const username = 'testuser';
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const name = 'Test User';

      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.createUser.mockResolvedValue({
        id: '1',
        username,
        email,
        password: 'hashed_StrongPass123!',
        name,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await userService.registerUser(
        username,
        email,
        password,
        name,
      );

      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(username);
      expect(Bun.password.hash).toHaveBeenCalledWith(password);
      expect(result.username).toBe(username);
      expect(result.email).toBe(email);
      expect(result.enabled).toBe(true);
      expect(result.password).toBe('hashed_StrongPass123!');
    });

    it('should throw an error if username already exists', async () => {
      const username = 'existinguser';
      const email = 'test@example.com';
      const password = 'StrongPass123!';

      mockUserRepository.findByUsername.mockResolvedValue({
        id: '1',
        username,
        email,
      });

      await expect(
        userService.registerUser(username, email, password),
      ).rejects.toThrow('Validation failed');
    });

    it('should throw an error for weak password', async () => {
      const username = 'testuser';
      const email = 'test@example.com';
      const weakPassword = 'weak';

      mockUserRepository.findByUsername.mockResolvedValue(null);

      await expect(
        userService.registerUser(username, email, weakPassword),
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('updatePassword', () => {
    const OLD_HASHED_PASSWORD = 'old_hashed_password';

    beforeEach(() => {
      mockUserRepository.findById.mockResolvedValue({
        id: '1',
        username: 'testuser',
        password: OLD_HASHED_PASSWORD,
      });
    });

    it('should successfully update password', async () => {
      mockUserRepository.updateUser.mockResolvedValue({
        id: '1',
        username: 'testuser',
        password: 'hashed_NewPass123!',
      });

      await userService.updatePassword(
        '1',
        'OldPass123!',
        'NewPass123!'
      );

      expect(Bun.password.verify).toHaveBeenCalledWith('OldPass123!', OLD_HASHED_PASSWORD);
      expect(Bun.password.hash).toHaveBeenCalledWith('NewPass123!');
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith('1', {
        password: 'hashed_NewPass123!'
      });
    });

    it('should throw error if old password is incorrect', async () => {
      (Bun.password.verify as jest.Mock).mockImplementation(async () => false);

      await expect(
        userService.updatePassword('1', 'WrongPass123!', 'NewPass123!')
      ).rejects.toThrow(BadRequestException);

      expect(Bun.password.verify).toHaveBeenCalledWith('WrongPass123!', OLD_HASHED_PASSWORD);
      expect(Bun.password.hash).not.toHaveBeenCalled();
    });

    it('should throw error if new password is weak', async () => {
      await expect(
        userService.updatePassword('1', 'OldPass123!', 'weak')
      ).rejects.toThrow('Validation failed');

      expect(Bun.password.verify).toHaveBeenCalledWith('OldPass123!', OLD_HASHED_PASSWORD);
      expect(Bun.password.hash).not.toHaveBeenCalled();
    });
  });

  describe('findByGithubId', () => {
    it('should find a user by GitHub ID', async () => {
      const githubId = '12345';
      const mockUser = {
        id: '1',
        githubId,
        username: 'githubuser',
      };

      mockUserRepository.findByGithubId.mockResolvedValue(mockUser);

      const result = await userService.findByGithubId(githubId);

      expect(mockUserRepository.findByGithubId).toHaveBeenCalledWith(githubId);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createGithubUser', () => {
    it('should create a new GitHub user', async () => {
      const githubUserData = {
        githubId: '12345',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        avatarImageUrl: 'http://example.com/avatar.jpg',
      };

      mockUserRepository.findByUsername.mockResolvedValue(null);
      mockUserRepository.createUser.mockResolvedValue({
        id: '1',
        ...githubUserData,
        enabled: true,
        password: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await userService.createGithubUser(githubUserData);

      expect(mockUserRepository.findByUsername).toHaveBeenCalledWith(githubUserData.username);
      expect(result.githubId).toBe(githubUserData.githubId);
      expect(result.username).toBe(githubUserData.username);
      expect(result.enabled).toBe(true);
    });

    it('should handle username conflict by appending timestamp', async () => {
      const githubUserData = {
        githubId: '12345',
        username: 'githubuser',
        email: 'github@example.com',
      };

      // Mock Date.now() to return a fixed timestamp
      const mockTimestamp = 1234567890;
      const realDateNow = Date.now;
      Date.now = jest.fn(() => mockTimestamp);

      mockUserRepository.findByUsername.mockResolvedValue({ username: 'githubuser' });
      mockUserRepository.createUser.mockResolvedValue({
        id: '1',
        ...githubUserData,
        username: `githubuser_${mockTimestamp}`,
        enabled: true,
        password: null,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
      });

      const result = await userService.createGithubUser(githubUserData);

      expect(result.username).toBe(`githubuser_${mockTimestamp}`);

      // Restore original Date.now
      Date.now = realDateNow;
    });
  });

  describe('checkUsernameAvailability', () => {
    it('should return available: true when username is available', async () => {
      const username = 'newuser';
      mockUserRepository.isUsernameAvailable.mockResolvedValue(true);

      const result = await userService.checkUsernameAvailability(username);

      expect(mockUserRepository.isUsernameAvailable).toHaveBeenCalledWith(username);
      expect(result.available).toBe(true);
      expect(result.suggestions).toEqual([]);
    });

    it('should return available: false with suggestions when username is taken', async () => {
      const username = 'takenuser';
      mockUserRepository.isUsernameAvailable.mockResolvedValue(false);

      const result = await userService.checkUsernameAvailability(username);

      expect(mockUserRepository.isUsernameAvailable).toHaveBeenCalledWith(username);
      expect(result.available).toBe(false);
      expect(result.suggestions).toEqual([
        `${username}1`,
        `${username}2`,
        `${username}3`
      ]);
    });
  });
});
