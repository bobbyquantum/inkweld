import { Test, TestingModule } from '@nestjs/testing';
import { LocalStrategy } from './local.strategy.js';
import { AuthService } from './auth.service.js';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(async () => {
    const mockAuthService = {
      validateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    strategy = module.get<LocalStrategy>(LocalStrategy);
    authService = module.get(AuthService);
  });

  describe('validate', () => {
    it('should return user on successful validation', async () => {
      authService.validateUser.mockResolvedValue(mockUser);

      const result = await strategy.validate('testuser', 'password123');

      expect(result).toBe(mockUser);
      expect(authService.validateUser).toHaveBeenCalledWith(
        'testuser',
        'password123',
      );
    });

    it('should throw UnauthorizedException when validation fails', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(
        strategy.validate('testuser', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);

      expect(authService.validateUser).toHaveBeenCalledWith(
        'testuser',
        'wrongpassword',
      );
    });

    it('should throw UnauthorizedException when service throws error', async () => {
      authService.validateUser.mockRejectedValue(
        new UnauthorizedException('Database connection failed'),
      );

      await expect(
        strategy.validate('testuser', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle empty credentials', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(strategy.validate('', '')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(authService.validateUser).toHaveBeenCalledWith('', '');
    });
  });
});
