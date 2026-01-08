import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SetupService } from '../services/core/setup.service';
import { UnifiedUserService } from '../services/user/unified-user.service';

/**
 * Guard that checks if the current user has admin privileges.
 * Redirects to home if user is not an admin.
 */
export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const setupService = inject(SetupService);
  const unifiedUserService = inject(UnifiedUserService);

  // Check if app is configured first
  const isConfigured = setupService.checkConfiguration();
  if (!isConfigured) {
    return router.createUrlTree(['/setup']);
  }

  const mode = setupService.getMode();

  // Admin functionality is only available in server mode
  if (mode !== 'server') {
    return router.createUrlTree(['/']);
  }

  // Check for cached user first - if no cache, redirect immediately
  if (
    !unifiedUserService.currentUser() ||
    unifiedUserService.currentUser().username === 'anonymous'
  ) {
    const hasCached = await unifiedUserService.hasCachedUser();
    if (!hasCached) {
      return router.createUrlTree(['/']);
    }
  }

  // Always initialize/refresh user data from server
  try {
    await unifiedUserService.initialize();
  } catch {
    return router.createUrlTree(['/']);
  }

  // Check if user is authenticated
  if (!unifiedUserService.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }

  // Check if user is admin
  const currentUser = unifiedUserService.currentUser();
  if (!currentUser?.isAdmin) {
    // Not an admin, redirect to home
    return router.createUrlTree(['/']);
  }

  return true;
};
