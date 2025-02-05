import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserService } from '../services/user.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const userService = inject(UserService);

  // Check for cached user first
  if (!userService.currentUser()) {
    const hasCached = await userService.hasCachedUser();
    if (!hasCached) {
      // No cached user, redirect to welcome
      return router.createUrlTree(['/welcome']);
    }
  }

  // Try loading/refreshing user data
  try {
    await userService.loadCurrentUser();
  } catch {
    // Any error during load should redirect to welcome
    return router.createUrlTree(['/welcome']);
  }

  // Allow navigation if authenticated
  if (userService.isAuthenticated()) {
    return true;
  }

  // Redirect to welcome page if not authenticated
  return router.createUrlTree(['/welcome']);
};
