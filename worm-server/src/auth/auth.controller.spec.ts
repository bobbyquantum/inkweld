import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '@nestjs/passport';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
  };
  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      switch (key) {
        case 'CLIENT_URL':
          return 'http://localhost:4200';
        default:
          return null;
      }
    }),
  };

  beforeEach(async () => {
    // Create mock AuthService
    const mockAuthService = {
      login: jest.fn(),
    };

    // Create mock AuthGuard
    const mockAuthGuard = jest.fn().mockImplementation(() => ({
      canActivate: jest.fn<() => any>().mockResolvedValue(true),
    }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(AuthGuard('local'))
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('should handle authentication failure', async () => {
      // Mock request object without user (authentication failed)
      const mockRequest = {};
      const mockResponse = {};
      await expect(
        controller.login(mockRequest, mockResponse as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should handle login service failure', async () => {
      const mockRequest = {
        user: mockUser,
      };

      const error = new Error('Login failed');
      authService.login.mockRejectedValue(error);

      const mockResponse = {};
      await expect(
        controller.login(mockRequest, mockResponse as any),
      ).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
    });
  });
});
