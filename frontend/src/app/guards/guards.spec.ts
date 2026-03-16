import {
  Injector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupService } from '../services/core/setup.service';
import { UnifiedUserService } from '../services/user/unified-user.service';
import { adminGuard } from './admin.guard';
import { authGuard } from './auth.guard';
import { CanDeactivateProjectGuard } from './can-deactivate-project.guard';

function runAuthGuard(injector: Injector, url: string = '/projects/test') {
  return runInInjectionContext(injector, () =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
  );
}

function runAdminGuard(injector: Injector) {
  return runInInjectionContext(injector, () =>
    adminGuard(
      {} as ActivatedRouteSnapshot,
      { url: '/admin' } as RouterStateSnapshot
    )
  );
}

describe('route guards', () => {
  let injector: Injector;
  let router: {
    createUrlTree: ReturnType<typeof vi.fn>;
  };
  let setupService: {
    checkConfiguration: ReturnType<typeof vi.fn>;
    getMode: ReturnType<typeof vi.fn>;
  };
  let unifiedUserService: {
    currentUser: ReturnType<typeof vi.fn>;
    hasCachedUser: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
  };

  const homeTree = { commands: ['/'] };
  const setupTree = { commands: ['/setup'] };

  beforeEach(() => {
    sessionStorage.clear();

    router = {
      createUrlTree: vi.fn((commands: string[]) => ({ commands })),
    };
    setupService = {
      checkConfiguration: vi.fn().mockReturnValue(true),
      getMode: vi.fn().mockReturnValue('server'),
    };
    unifiedUserService = {
      currentUser: vi.fn().mockReturnValue({
        username: 'testuser',
        isAdmin: true,
      }),
      hasCachedUser: vi.fn().mockResolvedValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn().mockReturnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: router },
        { provide: SetupService, useValue: setupService },
        { provide: UnifiedUserService, useValue: unifiedUserService },
        CanDeactivateProjectGuard,
      ],
    });

    injector = TestBed.inject(Injector);
  });

  describe('authGuard', () => {
    it('redirects to setup when the app is not configured', async () => {
      setupService.checkConfiguration.mockReturnValue(false);

      await expect(runAuthGuard(injector)).resolves.toEqual(setupTree);
    });

    it('allows navigation in local mode when the user is authenticated', async () => {
      setupService.getMode.mockReturnValue('local');

      await expect(runAuthGuard(injector)).resolves.toBe(true);
    });

    it('redirects local mode users to setup when unauthenticated', async () => {
      setupService.getMode.mockReturnValue('local');
      unifiedUserService.isAuthenticated.mockReturnValue(false);

      await expect(runAuthGuard(injector)).resolves.toEqual(setupTree);
    });

    it('redirects to home and stores the return url when no cached user exists', async () => {
      unifiedUserService.currentUser.mockReturnValue(null);
      unifiedUserService.hasCachedUser.mockResolvedValue(false);

      await expect(runAuthGuard(injector, '/project/alpha')).resolves.toEqual(
        homeTree
      );
      expect(sessionStorage.getItem('oauth_return_url')).toBe('/project/alpha');
    });

    it('redirects to home when initialize fails', async () => {
      unifiedUserService.initialize.mockRejectedValue(new Error('load failed'));

      await expect(runAuthGuard(injector)).resolves.toEqual(homeTree);
    });

    it('redirects to home when the user remains unauthenticated after initialization', async () => {
      unifiedUserService.isAuthenticated.mockReturnValue(false);

      await expect(runAuthGuard(injector)).resolves.toEqual(homeTree);
    });

    it('falls back to setup when the mode is unknown', async () => {
      setupService.getMode.mockReturnValue('unknown');

      await expect(runAuthGuard(injector)).resolves.toEqual(setupTree);
    });
  });

  describe('adminGuard', () => {
    it('redirects to setup when the app is not configured', async () => {
      setupService.checkConfiguration.mockReturnValue(false);

      await expect(runAdminGuard(injector)).resolves.toEqual(setupTree);
    });

    it('redirects to home outside server mode', async () => {
      setupService.getMode.mockReturnValue('local');

      await expect(runAdminGuard(injector)).resolves.toEqual(homeTree);
    });

    it('redirects to home when there is no cached user', async () => {
      unifiedUserService.currentUser.mockReturnValue(null);
      unifiedUserService.hasCachedUser.mockResolvedValue(false);

      await expect(runAdminGuard(injector)).resolves.toEqual(homeTree);
    });

    it('redirects to home when initialize fails', async () => {
      unifiedUserService.initialize.mockRejectedValue(new Error('load failed'));

      await expect(runAdminGuard(injector)).resolves.toEqual(homeTree);
    });

    it('redirects to home when the user is not authenticated', async () => {
      unifiedUserService.isAuthenticated.mockReturnValue(false);

      await expect(runAdminGuard(injector)).resolves.toEqual(homeTree);
    });

    it('redirects to home when the user is not an admin', async () => {
      unifiedUserService.currentUser.mockReturnValue({
        username: 'testuser',
        isAdmin: false,
      });

      await expect(runAdminGuard(injector)).resolves.toEqual(homeTree);
    });

    it('allows navigation for authenticated admins', async () => {
      await expect(runAdminGuard(injector)).resolves.toBe(true);
    });
  });

  describe('CanDeactivateProjectGuard', () => {
    it('delegates to the component canDeactivate method', async () => {
      const guard = TestBed.inject(CanDeactivateProjectGuard);
      const component = {
        canDeactivate: vi.fn().mockResolvedValue(true),
      };

      await expect(guard.canDeactivate(component as never)).resolves.toBe(true);
      expect(component.canDeactivate).toHaveBeenCalledTimes(1);
    });
  });
});
