import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '@nestjs/passport';
import { GithubAuthGuard } from './github-auth.guard.js';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from 'bun:test';
import { ConfigService } from '@nestjs/config';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

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

    // Create mock GithubAuthGuard
    const mockGithubAuthGuard = jest.fn().mockImplementation(() => ({
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
      .overrideGuard(GithubAuthGuard)
      .useValue(mockGithubAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('should handle authentication failure', async () => {
      // Mock request object without user (authentication failed)
      const mockRequest = {};
      await expect(controller.login(mockRequest as any)).rejects.toThrow(
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

      await expect(controller.login(mockRequest as any)).rejects.toThrow(error);
      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
    });
  });

  describe('getOAuthProviders', () => {
    it('should return github when GitHub is enabled', () => {
      // Mock the config to return 'true' for GITHUB_ENABLED
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'GITHUB_ENABLED':
            return 'true';
          default:
            return null;
        }
      });

      const result = controller.getOAuthProviders();
      expect(result).toEqual(['github']);
    });

    it('should return empty array when GitHub is disabled', () => {
      mockConfigService.get.mockReturnValue('false');
      expect(controller.getOAuthProviders()).toEqual([]);
    });
  });

  describe('githubLogin', () => {
    it('should initiate GitHub OAuth login', async () => {
      // This endpoint only initiates the OAuth flow
      // The actual redirection is handled by the passport strategy
      await expect(controller.githubLogin()).resolves.toBeUndefined();
    });
  });

  describe('githubLoginCallback', () => {
    let mockRequest;
    let mockResponse;

    beforeEach(() => {
      mockRequest = {
        user: mockUser,
      };
      mockResponse = {
        redirect: jest.fn(),
      };
    });

    it('should handle successful authentication', async () => {
      authService.login.mockResolvedValue(undefined);

      await controller.githubLoginCallback(mockRequest, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should handle missing client URL', async () => {
      mockConfigService.get.mockReturnValueOnce(null);

      await controller.githubLoginCallback(mockRequest, mockResponse);

      // In the catch block, it falls back to default URL
      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should handle missing user', async () => {
      mockRequest.user = undefined;

      await controller.githubLoginCallback(mockRequest, mockResponse);

      expect(authService.login).not.toHaveBeenCalled();
      expect(mockResponse.redirect).toHaveBeenCalled();
    });

    it('should handle login service failure', async () => {
      authService.login.mockRejectedValue(new Error('Login failed'));

      await controller.githubLoginCallback(mockRequest, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
      expect(mockResponse.redirect).toHaveBeenCalled();
    });
  });
});
