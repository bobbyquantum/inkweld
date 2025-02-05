import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { UserService } from '@services/user.service';
import { UserDto } from '@worm/index';

import { authGuard } from './auth.guard';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...args) =>
    TestBed.runInInjectionContext(() => authGuard(...args));

  let router: Router;
  let userService: UserService;
  let mockCurrentUser: WritableSignal<UserDto | undefined>;

  beforeEach(() => {
    mockCurrentUser = signal<UserDto | undefined>(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            createUrlTree: jest.fn().mockReturnValue(new UrlTree()),
          },
        },
        {
          provide: UserService,
          useValue: {
            currentUser: mockCurrentUser,
            loadCurrentUser: jest.fn(),
            isAuthenticated: computed(() => !!mockCurrentUser()),
            initialized: signal(true),
            error: signal(undefined),
          },
        },
      ],
    });

    router = TestBed.inject(Router);
    userService = TestBed.inject(UserService);
  });

  it('should allow access when user is already loaded and authenticated', async () => {
    const user: UserDto = {
      username: 'test',
      name: 'Test User',
      avatarImageUrl: 'https://example.com/avatar.png',
    };
    mockCurrentUser.set(user);

    expect(
      await executeGuard(
        {} as ActivatedRouteSnapshot,
        {} as RouterStateSnapshot
      )
    ).toBe(true);
    expect(userService.loadCurrentUser).not.toHaveBeenCalled();
  });

  it('should try to load user when not loaded', async () => {
    mockCurrentUser.set(undefined);
    (userService.loadCurrentUser as jest.Mock).mockResolvedValue(undefined);
    (router.createUrlTree as jest.Mock).mockReturnValue(
      router.createUrlTree(['/welcome'])
    );

    await executeGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot);
    expect(userService.loadCurrentUser).toHaveBeenCalled();
  });

  it('should redirect to welcome when unauthenticated', async () => {
    mockCurrentUser.set(undefined);
    (userService.loadCurrentUser as jest.Mock).mockResolvedValue(undefined);
    const welcomeUrlTree = new UrlTree();
    (router.createUrlTree as jest.Mock).mockReturnValue(welcomeUrlTree);

    const result = await executeGuard(
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot
    );
    expect(result).toBe(welcomeUrlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });

  // it('should handle API errors and redirect', async () => {
  //   mockCurrentUser.set(undefined);
  //   (userService.loadCurrentUser as jest.Mock).mockRejectedValue(
  //     new HttpErrorResponse({
  //       status: 401,
  //       statusText: 'Unauthorized',
  //       url: 'http://localhost:3000/api/user/me',
  //     })
  //   );
  //   const welcomeUrlTree = new UrlTree();
  //   (router.createUrlTree as jest.Mock).mockReturnValue(welcomeUrlTree);

  //   const result = await executeGuard(
  //     {} as ActivatedRouteSnapshot,
  //     {} as RouterStateSnapshot
  //   );
  //   expect(result).toBe(welcomeUrlTree);
  //   expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  // });
});
