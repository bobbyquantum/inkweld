import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserDto } from '@worm/index';

import { UserService } from '../services/user.service';

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
  const userService = inject(UserService);
  const authState = AuthState.getInstance();

  if (!authState.getUser()) {
    await userService.loadCurrentUser();
    const user = userService.currentUser();
    if (user) {
      authState.setUser(user);
    }
  }

  if (authState.getUser()) {
    return true;
  }

  return router.createUrlTree(['/welcome']);
};

// Export for testing
export const resetAuthState = () => {
  AuthState.getInstance().reset();
};
