import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from './user.entity.js';
import { Repository } from 'typeorm';
import { jest } from '@jest/globals';
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
        password: 'hashedpassword',
        name,
        enabled: true,
      });
      mockUserRepository.save.mockResolvedValue({
        id: '1',
        username,
        email,
        password: 'hashedpassword',
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
      expect(result.username).toBe(username);
      expect(result.email).toBe(email);
      expect(result.enabled).toBe(true);
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
      ).rejects.toThrow('Username already exists');
    });

    it('should throw an error for weak password', async () => {
      const username = 'testuser';
      const email = 'test@example.com';
      const weakPassword = 'weak';

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        userService.registerUser(username, email, weakPassword),
      ).rejects.toThrow('Password does not meet strength requirements');
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
  });
});
