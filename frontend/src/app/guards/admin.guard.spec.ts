import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { User } from '@inkweld/model/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupService } from '../services/core/setup.service';
import { UnifiedUserService } from '../services/user/unified-user.service';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  let routerMock: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };
  let setupServiceMock: {
    checkConfiguration: ReturnType<typeof vi.fn>;
    getMode: ReturnType<typeof vi.fn>;
  };
  let userServiceMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof signal<User | null>>;
    initialized: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    hasCachedUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    routerMock = {
      createUrlTree: vi.fn().mockImplementation((path: string[]) => ({
        toString: () => path.join('/'),
      })),
    };

    setupServiceMock = {
      checkConfiguration: vi.fn().mockReturnValue(true),
      getMode: vi.fn().mockReturnValue('server'),
    };

    userServiceMock = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: signal<User | null>({
        id: '1',
        username: 'admin',
        name: 'Admin User',
        enabled: true,
        isAdmin: true,
      }),
      initialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      hasCachedUser: vi.fn().mockResolvedValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
      ],
    });
  });

  const runGuard = () => {
    return TestBed.runInInjectionContext(() =>
      adminGuard(
        {} as unknown as Parameters<typeof adminGuard>[0],
        {} as unknown as Parameters<typeof adminGuard>[1]
      )
    );
  };

  it('should allow access for authenticated admin in server mode', async () => {
    const result = await runGuard();

    expect(result).toBe(true);
  });

  it('should redirect to /setup if not configured', async () => {
    setupServiceMock.checkConfiguration.mockReturnValue(false);

    await runGuard();

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/setup']);
  });

  it('should redirect to / if not in server mode', async () => {
    setupServiceMock.getMode.mockReturnValue('local');

    await runGuard();

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('should redirect to /welcome if not authenticated', async () => {
    userServiceMock.isAuthenticated.mockReturnValue(false);

    await runGuard();

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });

  it('should redirect to / if user is not admin', async () => {
    userServiceMock.currentUser = signal<User | null>({
      id: '2',
      username: 'user',
      name: 'Regular User',
      enabled: true,
      isAdmin: false,
    });
    userServiceMock.initialized = vi.fn().mockReturnValue(true);
    userServiceMock.initialize = vi.fn().mockResolvedValue(undefined);
    userServiceMock.hasCachedUser = vi.fn().mockResolvedValue(true);

    // Need to recreate the service mock with new signal
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
      ],
    });

    await runGuard();

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('should redirect to / if current user is null', async () => {
    userServiceMock.currentUser = signal<User | null>(null);
    userServiceMock.initialized = vi.fn().mockReturnValue(true);
    userServiceMock.initialize = vi.fn().mockResolvedValue(undefined);
    userServiceMock.hasCachedUser = vi.fn().mockResolvedValue(false);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
      ],
    });

    await runGuard();

    // With no cached user, it should redirect to welcome
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/welcome']);
  });
});
