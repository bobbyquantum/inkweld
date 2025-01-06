import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GithubAuthGuard } from './github-auth.guard';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';

describe('GithubAuthGuard', () => {
  let guard: GithubAuthGuard;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GithubAuthGuard],
    }).compile();

    guard = module.get<GithubAuthGuard>(GithubAuthGuard);

    // Mock parent AuthGuard's canActivate
    jest
      .spyOn(AuthGuard('github').prototype, 'canActivate')
      .mockImplementation(async () => true);

    // Mock Logger
    jest.spyOn(guard['logger'], 'verbose').mockImplementation(() => ({}));
    jest.spyOn(guard['logger'], 'log').mockImplementation(() => ({}));
    jest.spyOn(guard['logger'], 'error').mockImplementation(() => ({}));
    jest.spyOn(guard['logger'], 'warn').mockImplementation(() => ({}));

    // Setup mock request and context
    mockRequest = {
      method: 'GET',
      url: '/oauth2/code/github',
      headers: {},
      session: {},
      sessionID: 'test-session-id',
    };

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;
  });

  describe('canActivate', () => {
    it('should allow already authenticated users', async () => {
      mockRequest.user = mockUser;

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should handle successful GitHub authentication', async () => {
      // Already mocked in beforeEach

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should handle failed GitHub authentication', async () => {
      // Mock failed authentication
      jest
        .spyOn(AuthGuard('github').prototype, 'canActivate')
        .mockImplementation(async () => {
          throw new UnauthorizedException('Authentication failed');
        });

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle null/undefined authentication result', async () => {
      // Mock undefined authentication result
      jest
        .spyOn(AuthGuard('github').prototype, 'canActivate')
        .mockImplementation(async () => undefined);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(false);
    });
  });

  describe('handleRequest', () => {
    it('should return user on successful authentication', () => {
      const result = guard.handleRequest(null, mockUser, null);

      expect(result).toBe(mockUser);
    });

    it('should throw UnauthorizedException when no user is returned', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw original error when authentication fails', () => {
      const error = new Error('Authentication failed');

      expect(() => guard.handleRequest(error, null, null)).toThrow(error);
    });

    it('should handle authentication info object', () => {
      const info = { message: 'Additional auth info' };

      expect(() => guard.handleRequest(null, null, info)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logging', () => {
    it('should log request details during authentication', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'verbose');

      await guard.canActivate(mockContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        'GithubAuthGuard - Request Details',
        expect.any(Object),
      );
    });

    it('should log authentication result', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'log');

      await guard.canActivate(mockContext);

      expect(loggerSpy).toHaveBeenCalledWith(
        'GitHub authentication result',
        expect.any(Object),
      );
    });

    it('should log errors during authentication', async () => {
      const loggerSpy = jest.spyOn(guard['logger'], 'error');

      // Mock failed authentication
      jest
        .spyOn(AuthGuard('github').prototype, 'canActivate')
        .mockImplementation(async () => {
          throw new UnauthorizedException('Authentication failed');
        });

      try {
        await guard.canActivate(mockContext);
      } catch (_error) {
        // Expected error
      }

      expect(loggerSpy).toHaveBeenCalledWith(
        'GitHub authentication failed',
        expect.any(Error),
      );
    });
  });
});
