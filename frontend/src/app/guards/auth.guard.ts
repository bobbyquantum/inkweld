import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SetupService } from '../services/core/setup.service';
import { UnifiedUserService } from '../services/user/unified-user.service';

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
  if (mode === 'local') {
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
        // No cached user, redirect to home page (where login dialog can be opened)
        return router.createUrlTree(['/']);
      }
    }

    // Try loading/refreshing user data
    try {
      await unifiedUserService.initialize();
    } catch {
      // Any error during load should redirect to home page
      return router.createUrlTree(['/']);
    }

    // Allow navigation if authenticated
    if (unifiedUserService.isAuthenticated()) {
      return true;
    }

    // Redirect to home page if not authenticated
    return router.createUrlTree(['/']);
  }

  // Fallback to setup if no valid mode
  return router.createUrlTree(['/setup']);
};
