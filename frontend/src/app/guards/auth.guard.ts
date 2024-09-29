import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { User, UserAPIService } from 'worm-api-client';
import { lastValueFrom } from 'rxjs';

let cachedUser: User | null = null;

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const userService: UserAPIService = inject(UserAPIService);

  try {
    if (!cachedUser) {
      cachedUser = await lastValueFrom(userService.getCurrentUser());
    }

    if (cachedUser) {
      return true;
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
  }

  // Redirect to login page if not authenticated
  return router.createUrlTree(['/welcome']);
};
