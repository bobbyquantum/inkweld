import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from 'express-session';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import { UserEntity } from '../user/user.entity.js';
import { TypeOrmSessionStore } from './session.store.js';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest, spyOn } from 'bun:test';

// Mock Bun.password methods using spyOn
spyOn(Bun.password, 'hash')
  .mockImplementation(async (pass) => `hashed_${pass}`);
spyOn(Bun.password, 'verify').mockImplementation(async () => true);

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<UserEntity>;

  const mockUser: UserEntity = {
    id: '123',
    username: 'testuser',
    password: 'hashedpassword',
    name: 'Test User',
    email: 'test@example.com',
    enabled: true,
    githubId: null,
  };

  const mockSessionStore = {
    get: jest.fn(),
    set: jest.fn(),
    destroy: jest.fn(),
  };

  const mockUserService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TypeOrmSessionStore,
          useValue: mockSessionStore,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );

    // Reset Bun password verify mock before each test
    (Bun.password.verify as jest.Mock).mockReset();
    (Bun.password.verify as jest.Mock).mockImplementation(async () => true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should throw UnauthorizedException for non-existent user', async () => {
      spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.validateUser('nonexistent', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for disabled user', async () => {
      spyOn(userRepository, 'findOne').mockResolvedValue({
        ...mockUser,
        enabled: false,
      });

      await expect(
        service.validateUser('testuser', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (Bun.password.verify as jest.Mock).mockImplementation(async () => false);

      await expect(
        service.validateUser('testuser', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user data for valid credentials', async () => {
      spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (Bun.password.verify as jest.Mock).mockImplementation(async () => true);

      const result = await service.validateUser('testuser', 'correctpassword');
      const { password: _, ...expectedUser } = mockUser;
      expect(result).toEqual(expectedUser);
    });
  });

  describe('login', () => {
    it('should create session and return user data', async () => {
      const mockSession = {
        regenerate: jest.fn<(cb: (err: any) => void) => void>((cb) => cb(null)),
        save: jest.fn<(cb: (err: any) => void) => void>((cb) => cb(null)),
        userId: undefined,
        username: undefined,
        userData: undefined,
      } as any;

      const mockReq = {
        session: mockSession,
      };

      const result = await service.login(mockReq as any, mockUser);

      expect(mockReq.session.regenerate).toHaveBeenCalled();
      expect(mockReq.session.save).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Login successful',
        user: {
          id: mockUser.id,
          username: mockUser.username,
        },
      });
      expect(mockReq.session.userId).toBe(mockUser.id);
      expect(mockReq.session.username).toBe(mockUser.username);
      expect(mockReq.session.userData).toEqual({
        name: mockUser.name,
        enabled: mockUser.enabled,
      });
    });

    it('should reject if session regeneration fails', async () => {
      const mockSession = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        regenerate: jest.fn((cb: Function) => cb(new Error('Session error'))),
      } as any;

      const mockReq = {
        session: mockSession,
      };

      await expect(service.login(mockReq as any, mockUser)).rejects.toThrow(
        'Session error',
      );
    });

    it('should reject if session save fails', async () => {
      const mockSession = {
        regenerate: jest.fn<(cb: (err: any) => void) => void>((cb) => cb(null)),
        save: jest.fn<(cb: (err: any) => void) => void>((cb) =>
          cb(new Error('Save error')),
        ),
      } as unknown as Session;

      const mockReq = {
        session: mockSession,
      };

      await expect(service.login(mockReq as any, mockUser)).rejects.toThrow(
        'Save error',
      );
    });
  });

  describe('logout', () => {
    it('should destroy session successfully', async () => {
      const mockSession = {
        destroy: jest.fn<(cb: (err: any) => void) => void>((cb) => cb(null)),
      } as any;

      const mockReq = {
        session: mockSession,
      };

      const result = await service.logout(mockReq as any);
      expect(result).toEqual({ message: 'Logout successful' });
      expect(mockReq.session.destroy).toHaveBeenCalled();
    });

    it('should reject if session destruction fails', async () => {
      const mockSession = {
        destroy: jest.fn<(cb: (err: any) => void) => void>((cb) =>
          cb(new Error('Destroy error')),
        ),
      } as unknown as Session;

      const mockReq = {
        session: mockSession,
      } as any;

      await expect(service.logout(mockReq)).rejects.toThrow(
        'Destroy error',
      );
    });
  });

  describe('findOrCreateGithubUser', () => {
    const mockGithubProfile = {
      id: '12345',
      username: 'githubuser',
      emails: [{ value: 'github@example.com' }],
      displayName: 'GitHub User',
      photos: [{ value: 'https://github.com/photo.jpg' }],
    };

    it('should return existing user if found by GitHub ID', async () => {
      const existingUser = { ...mockUser, githubId: '12345' };
      spyOn(userRepository, 'findOne').mockResolvedValue(existingUser);

      const result = await service.findOrCreateGithubUser(mockGithubProfile);
      expect(result).toEqual(existingUser);
    });

    it('should create new user if not found', async () => {
      spyOn(userRepository, 'findOne').mockResolvedValue(null);
      spyOn(userRepository, 'create').mockReturnValue({
        ...mockUser,
        githubId: '12345',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        password: null,
      });
      spyOn(userRepository, 'save')
        .mockImplementation(async (user) => user);

      const result = await service.findOrCreateGithubUser(mockGithubProfile);

      expect(userRepository.create).toHaveBeenCalledWith({
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
        githubId: '12345',
        enabled: true,
        password: null,
      });
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.githubId).toBe('12345');
    });

    it('should handle GitHub profile without optional fields', async () => {
      const minimalProfile = {
        id: '12345',
        username: 'githubuser',
      };

      spyOn(userRepository, 'findOne').mockResolvedValue(null);
      spyOn(userRepository, 'create').mockReturnValue({
        ...mockUser,
        githubId: '12345',
        username: 'githubuser',
        email: null,
        name: null,
        password: null,
      });
      spyOn(userRepository, 'save')
        .mockImplementation(async (user) => user);

      const result = await service.findOrCreateGithubUser(minimalProfile);

      expect(userRepository.create).toHaveBeenCalledWith({
        username: 'githubuser',
        email: null,
        name: null,
        githubId: '12345',
        enabled: true,
        password: null,
      });
      expect(result.githubId).toBe('12345');
    });
  });
});
