import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from './user.entity.js';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  spyOn,
} from 'bun:test';
import { BadRequestException } from '@nestjs/common';

// Mock Bun.password methods using spyOn
spyOn(Bun.password, 'hash').mockImplementation(
  async (pass) => `hashed_${pass}`,
);
spyOn(Bun.password, 'verify').mockImplementation(async () => true);

describe('UserService', () => {
  let userService: UserService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let userRepository: Repository<UserEntity>;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let configService: ConfigService;

  const mockUserRepository = {
    findOne: jest.fn<() => any>(),
    create: jest.fn<() => any>(),
    save: jest.fn<() => any>(),
    remove: jest.fn<() => any>(),
    findAndCount: jest.fn<() => any>(), // Mock findAndCount
    createQueryBuilder: jest.fn<() => any>(), // Mock createQueryBuilder
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DATA_PATH') return './test-data';
      return undefined;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    configService = module.get<ConfigService>(ConfigService);

    // Reset Bun password mock implementations before each test
    (Bun.password.hash as jest.Mock).mockImplementation(
      async (pass) => `hashed_${pass}`,
    );
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
      await userService.updatePassword('1', 'OldPass123!', 'NewPass123!');

      expect(Bun.password.verify).toHaveBeenCalledWith(
        'OldPass123!',
        OLD_HASHED_PASSWORD,
      );
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
        userService.updatePassword('1', 'WrongPass123!', 'NewPass123!'),
      ).rejects.toThrow(BadRequestException);

      expect(Bun.password.verify).toHaveBeenCalledWith(
        'WrongPass123!',
        OLD_HASHED_PASSWORD,
      );
      expect(Bun.password.hash).not.toHaveBeenCalled();
    });

    it('should throw error if new password is weak', async () => {
      await expect(
        userService.updatePassword('1', 'OldPass123!', 'weak'),
      ).rejects.toThrow('Validation failed');

      expect(Bun.password.verify).toHaveBeenCalledWith(
        'OldPass123!',
        OLD_HASHED_PASSWORD,
      );
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
      } as UserEntity;

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

  describe('getPagedUsers', () => {
    it('should return a paged list of users', async () => {
      const page = 1;
      const pageSize = 10;
      const mockUsers = Array.from({ length: 15 }, (_, i) => ({
        id: `${i + 1}`,
        username: `user${i + 1}`,
      })) as UserEntity[];
      const mockFindAndCountResult = [
        mockUsers.slice(0, pageSize),
        mockUsers.length,
      ];

      mockUserRepository.findAndCount.mockResolvedValue(mockFindAndCountResult);

      const result = await userService.getPagedUsers({ page, pageSize });

      expect(mockUserRepository.findAndCount).toHaveBeenCalledWith({
        skip: 0,
        take: pageSize,
      });
      expect(result.users).toEqual(mockUsers.slice(0, pageSize));
      expect(result.total).toBe(mockUsers.length);
    });
  });

  describe('pagedSearchUsers', () => {
    it('should return a paged list of users based on search term', async () => {
      const term = 'user';
      const page = 1;
      const pageSize = 10;
      const mockUsers = Array.from({ length: 5 }, (_, i) => ({
        id: `${i + 1}`,
        username: `user${i + 1}`,
      })) as UserEntity[];
      const mockGetManyAndCountResult = [mockUsers, mockUsers.length];

      const mockCreateQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue(mockGetManyAndCountResult),
      };
      mockUserRepository.createQueryBuilder = jest.fn(
        () => mockCreateQueryBuilder,
      );

      const result = await userService.pagedSearchUsers({
        term,
        page,
        pageSize,
      });

      expect(mockUserRepository.createQueryBuilder).toHaveBeenCalledWith(
        'user',
      );
      expect(mockCreateQueryBuilder.where).toHaveBeenCalledWith(
        'user.username LIKE :term OR user.name LIKE :term OR user.email LIKE :term',
        { term: `%${term}%` },
      );
      expect(mockCreateQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockCreateQueryBuilder.take).toHaveBeenCalledWith(pageSize);
      expect(mockCreateQueryBuilder.getManyAndCount).toHaveBeenCalled();
      expect(result.users).toEqual(mockUsers);
      expect(result.total).toBe(mockUsers.length);
    });
  });
});
