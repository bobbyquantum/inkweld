import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Request } from 'express';
import { Session } from 'express-session';
import { AuthService } from './auth.service.js';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserEntity } from './user.entity.js';
import { UserService } from './user.service.js';
import { SessionStore } from './session.store.js';
import { UserRepository } from './user.repository.js';
// Mock Bun.password methods using spyOn
jest
  .spyOn(Bun.password, 'hash')
  .mockImplementation(async (pass) => `hashed_${pass}`);
jest.spyOn(Bun.password, 'verify').mockImplementation(async () => true);

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: UserRepository;

  const mockUser: UserEntity = {
    id: '123',
    username: 'testuser',
    password: 'hashedpassword',
    name: 'Test User',
    email: 'test@example.com',
    enabled: true,
    githubId: null,
    avatarImageUrl: null,
    createdAt: 0,
    updatedAt: 0,
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
          provide: UserRepository,
          useValue: {
            findByUsername: jest.fn(),
            findByGithubId: jest.fn(),
            createUser: jest.fn(),
          }
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: SessionStore,
          useValue: mockSessionStore,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<UserRepository>(
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
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.validateUser('nonexistent', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for disabled user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        ...mockUser,
        enabled: false,
      });

      await expect(
        service.validateUser('testuser', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      (Bun.password.verify as jest.Mock).mockImplementation(async () => false);

      await expect(
        service.validateUser('testuser', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
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
      } as unknown as Session;

      const mockReq = {
        session: mockSession,
      } as Request;

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
        avatarImageUrl: mockUser.avatarImageUrl,
        enabled: mockUser.enabled,
      });
    });

    it('should reject if session regeneration fails', async () => {
      const mockSession = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        regenerate: jest.fn((cb: Function) => cb(new Error('Session error'))),
      } as unknown as Session;

      const mockReq = {
        session: mockSession,
      } as Request;

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
      } as Request;

      await expect(service.login(mockReq as any, mockUser)).rejects.toThrow(
        'Save error',
      );
    });
  });

  describe('logout', () => {
    it('should destroy session successfully', async () => {
      const mockSession = {
        destroy: jest.fn<(cb: (err: any) => void) => void>((cb) => cb(null)),
      } as unknown as Session;

      const mockReq = {
        session: mockSession,
      } as Request;

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
      } as Request;

      await expect(service.logout(mockReq as any)).rejects.toThrow(
        'Destroy error',
      );
    });
  });
});
