import { Test, TestingModule } from '@nestjs/testing';
import { OAuth2Controller } from './oauth2.controller.js';
import { AuthService } from './auth.service.js';
import { GithubAuthGuard } from './github-auth.guard.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
describe('OAuth2Controller', () => {
  let controller: OAuth2Controller;
  let authService: jest.Mocked<AuthService>;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(async () => {
    const mockAuthService = {
      login: jest.fn(),
    };

    // Create mock GithubAuthGuard
    const mockGithubAuthGuard = jest.fn().mockImplementation(() => ({
      canActivate: jest.fn<() => any>().mockResolvedValue(true),
    }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuth2Controller],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(GithubAuthGuard)
      .useValue(mockGithubAuthGuard)
      .compile();

    controller = module.get<OAuth2Controller>(OAuth2Controller);
    authService = module.get(AuthService);
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
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:8333/',
      );
    });

    it('should handle missing user', async () => {
      mockRequest.user = undefined;

      await controller.githubLoginCallback(mockRequest, mockResponse);

      expect(authService.login).not.toHaveBeenCalled();
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:8333/login?error=authentication_failed',
      );
    });

    it('should handle login service failure', async () => {
      authService.login.mockRejectedValue(new Error('Login failed'));

      await controller.githubLoginCallback(mockRequest, mockResponse);

      expect(authService.login).toHaveBeenCalledWith(mockRequest, mockUser);
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        'http://localhost:8333/login?error=server_error',
      );
    });
  });
});
