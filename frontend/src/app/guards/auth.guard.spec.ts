import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { UserDto } from '@inkweld/index';
import { UserService } from '@services/user.service';

import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let router: Router;
  let userService: UserService;
  let mockCurrentUser: WritableSignal<UserDto | undefined>;

  const executeGuard: CanActivateFn = (...args) =>
    TestBed.runInInjectionContext(() => authGuard(...args));

  beforeEach(() => {
    mockCurrentUser = signal<UserDto | undefined>(undefined);

    // Create mock services
    router = {
      createUrlTree: jest.fn().mockReturnValue(new UrlTree()),
    } as unknown as Router;

    userService = {
      currentUser: mockCurrentUser,
      loadCurrentUser: jest.fn(),
      hasCachedUser: jest.fn(),
      isAuthenticated: computed(() => !!mockCurrentUser()),
      initialized: signal(true),
      error: signal(undefined),
    } as unknown as UserService;

    // Configure TestBed once
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: UserService, useValue: userService },
      ],
    });
  });

  it('should allow access when user is already loaded and authenticated', async () => {
    const user: UserDto = {
      username: 'test',
      name: 'Test User',
    };
    mockCurrentUser.set(user);

    expect(
      await executeGuard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      )
    ).toBe(true);
  });

  it('should redirect to welcome when no cached user', async () => {
    mockCurrentUser.set(undefined);
    (userService.hasCachedUser as jest.Mock).mockResolvedValue(false);
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as jest.Mock).mockReturnValue(welcomeUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(welcomeUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });

  it('should try to load user when cached user exists', async () => {
    mockCurrentUser.set(undefined);
    (userService.hasCachedUser as jest.Mock).mockResolvedValue(true);
    (userService.loadCurrentUser as jest.Mock).mockResolvedValue(undefined);
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as jest.Mock).mockReturnValue(welcomeUrlTree);

    await executeGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot);
    expect(userService.loadCurrentUser).toHaveBeenCalled();
  });

  it('should redirect to welcome when load fails', async () => {
    mockCurrentUser.set(undefined);
    (userService.hasCachedUser as jest.Mock).mockResolvedValue(true);
    (userService.loadCurrentUser as jest.Mock).mockRejectedValue(
      new Error('Failed to load')
    );
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as jest.Mock).mockReturnValue(welcomeUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(welcomeUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });
});
