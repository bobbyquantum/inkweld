import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../user/user.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { jest } from '@jest/globals';
describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let userService: jest.Mocked<UserService>;

  const mockUser = {
    id: 'test-user-id',
    username: 'testuser',
    name: 'Test User',
    avatarImageUrl: 'https://example.com/avatar.png',
    // Add other required user properties that aren't used by the guard
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
    password: null,
    githubId: null,
    enabled: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionAuthGuard,
        {
          provide: UserService,
          useValue: {
            getCurrentUser: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<SessionAuthGuard>(SessionAuthGuard);
    userService = module.get(UserService);
  });

  const mockExecutionContext = (sessionData?: any): ExecutionContext => {
    const mockRequest = {
      session: sessionData,
      headers: {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access when session and user are valid', async () => {
    userService.getCurrentUser.mockResolvedValue(mockUser);
    const context = mockExecutionContext({ userId: mockUser.id });
    const request = context.switchToHttp().getRequest();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(userService.getCurrentUser).toHaveBeenCalledWith(mockUser.id);
    expect(request.user).toEqual({
      id: mockUser.id,
      username: mockUser.username,
      name: mockUser.name,
      avatarImageUrl: mockUser.avatarImageUrl,
    });
  });

  it('should throw UnauthorizedException when no session exists', async () => {
    const context = mockExecutionContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Not authenticated'),
    );
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when session exists but no userId', async () => {
    const context = mockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Not authenticated'),
    );
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when user lookup fails', async () => {
    userService.getCurrentUser.mockRejectedValue(new Error('User not found'));
    const context = mockExecutionContext({ userId: 'invalid-user-id' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid session'),
    );
    expect(userService.getCurrentUser).toHaveBeenCalledWith('invalid-user-id');
  });
});
