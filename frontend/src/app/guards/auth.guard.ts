import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserAPIService, UserDto } from '@worm/index';
import { lastValueFrom } from 'rxjs';

// Move cache to a service pattern for better testability
class AuthState {
  private static instance: AuthState;
  private cachedUser: UserDto | null = null;

  private constructor() {}

  static getInstance(): AuthState {
    if (!AuthState.instance) {
      AuthState.instance = new AuthState();
    }
    return AuthState.instance;
  }

  getUser(): UserDto | null {
    return this.cachedUser;
  }

  setUser(user: UserDto | null): void {
    this.cachedUser = user;
  }

  reset(): void {
    this.cachedUser = null;
  }
}

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const userService: UserAPIService = inject(UserAPIService);
  const authState = AuthState.getInstance();

  try {
    if (!authState.getUser()) {
      const user = await lastValueFrom(userService.userControllerGetMe());
      authState.setUser(user);
    }

    if (authState.getUser()) {
      return true;
    }

    return router.createUrlTree(['/welcome']);
  } catch (error: unknown) {
    if (
      error instanceof HttpErrorResponse &&
      'status' in error &&
      error.status === 502
    ) {
      return router.createUrlTree(['/unavailable']);
    }
    return router.createUrlTree(['/welcome']);
  }
};

// Export for testing
export const resetAuthState = () => {
  AuthState.getInstance().reset();
};
