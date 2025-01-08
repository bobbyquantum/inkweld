import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '@nestjs/passport';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
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
    it('should successfully login a user', async () => {
      // Mock request object with authenticated user
      const mockRequest = {
        user: mockUser,
      };

      authService.login.mockResolvedValue(undefined);

      const result = await controller.login(mockRequest);

      expect(result).toEqual({
        hello: 'world',
        user: mockUser,
      });
      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
    });

    it('should handle authentication failure', async () => {
      // Mock request object without user (authentication failed)
      const mockRequest = {};

      await expect(controller.login(mockRequest)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('should handle login service failure', async () => {
      const mockRequest = {
        user: mockUser,
      };

      const error = new Error('Login failed');
      authService.login.mockRejectedValue(error);

      await expect(controller.login(mockRequest)).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
    });
  });
});
