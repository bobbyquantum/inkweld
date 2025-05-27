import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SetupService } from '../services/setup.service';
import { UnifiedUserService } from '../services/unified-user.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const setupService = inject(SetupService);
  const unifiedUserService = inject(UnifiedUserService);

  // Check if app is configured first
  const isConfigured = setupService.checkConfiguration();
  if (!isConfigured) {
    return router.createUrlTree(['/setup']);
  }

  const mode = setupService.getMode();

  // For offline mode, check if user is authenticated
  if (mode === 'offline') {
    if (unifiedUserService.isAuthenticated()) {
      return true;
    }
    // In offline mode, if not authenticated, redirect to setup
    return router.createUrlTree(['/setup']);
  }

  // For server mode, check cached user and try to load
  if (mode === 'server') {
    // Check for cached user first
    if (
      !unifiedUserService.currentUser() ||
      unifiedUserService.currentUser().username === 'anonymous'
    ) {
      const hasCached = await unifiedUserService.hasCachedUser();
      if (!hasCached) {
        // No cached user, redirect to welcome
        return router.createUrlTree(['/welcome']);
      }
    }

    // Try loading/refreshing user data
    try {
      await unifiedUserService.initialize();
    } catch {
      // Any error during load should redirect to welcome
      return router.createUrlTree(['/welcome']);
    }

    // Allow navigation if authenticated
    if (unifiedUserService.isAuthenticated()) {
      return true;
    }

    // Redirect to welcome page if not authenticated
    return router.createUrlTree(['/welcome']);
  }

  // Fallback to setup if no valid mode
  return router.createUrlTree(['/setup']);
};
