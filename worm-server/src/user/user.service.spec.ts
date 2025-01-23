import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from './user.entity.js';
import { Repository } from 'typeorm';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { BadRequestException } from '@nestjs/common';

// Define minimal interface for what we need from Bun's password functionality
interface BunPasswordAPI {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
}

// Declare types for Bun global
declare const Bun: {
  password: BunPasswordAPI;
};

// Set up mock
Object.assign(global, {
  Bun: {
    password: {
      hash: jest.fn().mockImplementation(async (pass) => `hashed_${pass}`),
      verify: jest.fn().mockImplementation(async () => true),
    },
  },
});

describe('UserService', () => {
  let userService: UserService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userRepository: Repository<UserEntity>;

  const mockUserRepository = {
    findOne: jest.fn<() => any>(),
    create: jest.fn<() => any>(),
    save: jest.fn<() => any>(),
    remove: jest.fn<() => any>(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );

    // Reset Bun password mock implementations before each test
    (Bun.password.hash as jest.Mock).mockImplementation(async (pass) => `hashed_${pass}`);
    (Bun.password.verify as jest.Mock).mockImplementation(async () => true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const username = 'testuser';
      const email = 'test@example.com';
      const password = 'StrongPass123!';
      const name = 'Test User';

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        username,
        email,
        password: 'hashed_StrongPass123!',
        name,
        enabled: true,
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        username,
        email,
        password: 'hashed_StrongPass123!',
        name,
        enabled: true,
      });

      const result = await userService.registerUser(
        username,
        email,
        password,
        name,
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { username: username },
      });
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

      mockUserRepository.findOne.mockResolvedValue({
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

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        userService.registerUser(username, email, weakPassword),
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('updatePassword', () => {
    const OLD_HASHED_PASSWORD = 'old_hashed_password';

    beforeEach(() => {
      mockUserRepository.findOne.mockResolvedValue({
        id: '1',
        username: 'testuser',
        password: OLD_HASHED_PASSWORD,
      });
    });

    it('should successfully update password', async () => {
      await userService.updatePassword(
        '1',
        'OldPass123!',
        'NewPass123!'
      );

      expect(Bun.password.verify).toHaveBeenCalledWith('OldPass123!', OLD_HASHED_PASSWORD);
      expect(Bun.password.hash).toHaveBeenCalledWith('NewPass123!');
      expect(mockUserRepository.save).toHaveBeenCalledWith({
        id: '1',
        username: 'testuser',
        password: 'hashed_NewPass123!',
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

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await userService.findByGithubId(githubId);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { githubId: githubId },
      });
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

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({
        ...githubUserData,
        enabled: true,
        password: null,
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        ...githubUserData,
        enabled: true,
        password: null,
      });

      const result = await userService.createGithubUser(githubUserData);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { username: githubUserData.username },
      });
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

      mockUserRepository.findOne.mockResolvedValue({ username: 'githubuser' });
      mockUserRepository.create.mockReturnValue({
        ...githubUserData,
        username: `githubuser_${mockTimestamp}`,
        enabled: true,
        password: null,
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        ...githubUserData,
        username: `githubuser_${mockTimestamp}`,
        enabled: true,
        password: null,
      });

      const result = await userService.createGithubUser(githubUserData);

      expect(result.username).toBe(`githubuser_${mockTimestamp}`);

      // Restore original Date.now
      Date.now = realDateNow;
    });
  });
});
