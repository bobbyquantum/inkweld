import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { User, UserAPIService } from 'worm-api-client';

let cachedUser: User | null = null;

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const userService: UserAPIService = inject(UserAPIService);

  try {
    if (!cachedUser) {
      cachedUser = await lastValueFrom(userService.getCurrentUser());
    }

    if (cachedUser) {
      console.log('Found cache user, allowing activation');
      return true;
    }
  } catch (error: unknown) {
    if (
      error instanceof HttpErrorResponse &&
      'status' in error &&
      error.status === 502
    ) {
      return router.createUrlTree(['/unavailable']);
    }
  }

  // Redirect to login page if not authenticated
  return router.createUrlTree(['/welcome']);
};
