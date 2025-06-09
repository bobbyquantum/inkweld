import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { UserDto } from '@inkweld/index';
import { SetupService } from '@services/setup.service';
import { UnifiedUserService } from '@services/unified-user.service';

import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let router: Router;
  let setupService: SetupService;
  let unifiedUserService: UnifiedUserService;
  let mockCurrentUser: WritableSignal<UserDto | undefined>;

  const executeGuard: CanActivateFn = (...args) =>
    TestBed.runInInjectionContext(() => authGuard(...args));

  beforeEach(() => {
    mockCurrentUser = signal<UserDto | undefined>(undefined);

    // Create mock services
    router = {
      createUrlTree: vi.fn().mockReturnValue(new UrlTree()),
    } as unknown as Router;

    setupService = {
      checkConfiguration: vi.fn().mockReturnValue(true),
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as SetupService;

    unifiedUserService = {
      currentUser: mockCurrentUser,
      initialize: vi.fn(),
      hasCachedUser: vi.fn(),
      isAuthenticated: vi.fn().mockReturnValue(false),
    } as unknown as UnifiedUserService;

    // Configure TestBed once
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SetupService, useValue: setupService },
        { provide: UnifiedUserService, useValue: unifiedUserService },
      ],
    });
  });

  it('should redirect to setup when app is not configured', async () => {
    (setupService.checkConfiguration as vi.Mock).mockReturnValue(false);
    const setupUrlTree = new UrlTree();
    (router.createUrlTree as vi.Mock).mockReturnValue(setupUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(setupUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/setup']);
  });

  it('should allow access when user is authenticated in offline mode', async () => {
    (setupService.getMode as vi.Mock).mockReturnValue('offline');
    (unifiedUserService.isAuthenticated as vi.Mock).mockReturnValue(true);

    expect(
      await executeGuard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      )
    ).toBe(true);
  });

  it('should redirect to setup when not authenticated in offline mode', async () => {
    (setupService.getMode as vi.Mock).mockReturnValue('offline');
    (unifiedUserService.isAuthenticated as vi.Mock).mockReturnValue(false);
    const setupUrlTree = new UrlTree();
    (router.createUrlTree as vi.Mock).mockReturnValue(setupUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(setupUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/setup']);
  });

  it('should allow access when user is authenticated in server mode', async () => {
    const user: UserDto = {
      username: 'test',
      name: 'Test User',
    };
    mockCurrentUser.set(user);
    (unifiedUserService.isAuthenticated as vi.Mock).mockReturnValue(true);

    expect(
      await executeGuard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      )
    ).toBe(true);
  });

  it('should redirect to welcome when no cached user in server mode', async () => {
    mockCurrentUser.set(undefined);
    (unifiedUserService.hasCachedUser as vi.Mock).mockResolvedValue(false);
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as vi.Mock).mockReturnValue(welcomeUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(welcomeUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });

  it('should try to initialize user when cached user exists in server mode', async () => {
    mockCurrentUser.set(undefined);
    (unifiedUserService.hasCachedUser as vi.Mock).mockResolvedValue(true);
    (unifiedUserService.initialize as vi.Mock).mockResolvedValue(undefined);
    (unifiedUserService.isAuthenticated as vi.Mock).mockReturnValue(true);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(true);
    expect(unifiedUserService.initialize).toHaveBeenCalled();
  });

  it('should redirect to welcome when initialization fails in server mode', async () => {
    mockCurrentUser.set(undefined);
    (unifiedUserService.hasCachedUser as vi.Mock).mockResolvedValue(true);
    (unifiedUserService.initialize as vi.Mock).mockRejectedValue(
      new Error('Failed to initialize')
    );
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as vi.Mock).mockReturnValue(welcomeUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(welcomeUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });
});
