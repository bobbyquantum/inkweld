import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserService } from '../services/user.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const userService = inject(UserService);

  // Load user if not already loaded
  if (!userService.currentUser()) {
    await userService.loadCurrentUser();
  }

  // Allow navigation if authenticated
  if (userService.isAuthenticated()) {
    return true;
  }

  // Redirect to welcome page if not authenticated
  return router.createUrlTree(['/welcome']);
};
