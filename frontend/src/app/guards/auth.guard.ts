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
  console.log('Checking auth guard');
  const authState = AuthState.getInstance();

  if (!authState.getUser()) {
    console.log('No user found, attempting to retrieve');
    await userService.loadCurrentUser();
    console.log('User load complete');
    const user = userService.currentUser();
    console.log('Current user');
    if (user) {
      authState.setUser(user);
      console.log('User stored');
    }
  }

  if (authState.getUser()) {
    console.log('User found, continuing');
    return true;
  }
  console.log('Directing to welcome page');
  return router.createUrlTree(['/welcome']);
};

// Export for testing
export const resetAuthState = () => {
  AuthState.getInstance().reset();
};
