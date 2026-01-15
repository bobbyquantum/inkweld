import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@inkweld/index';

import { SetupService } from '../core/setup.service';
import { LocalUserService } from '../local/local-user.service';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root',
})
export class UnifiedUserService {
  private setupService = inject(SetupService);
  private userService = inject(UserService);
  private localUserService = inject(LocalUserService);
  private router = inject(Router);

  readonly currentUser = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return this.localUserService.currentUser();
    }
    return this.userService.currentUser();
  });

  readonly isLoading = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return this.localUserService.isLoading();
    }
    return this.userService.isLoading();
  });

  readonly isAuthenticated = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return this.localUserService.isAuthenticated();
    }
    return this.userService.isAuthenticated();
  });

  readonly initialized = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return this.localUserService.initialized();
    }
    return this.userService.initialized();
  });

  readonly error = computed(() => {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return undefined; // Offline mode doesn't have network errors
    }
    return this.userService.error();
  });

  async initialize(): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      this.localUserService.initializeFromSetup();
    } else if (mode === 'server') {
      try {
        await this.userService.loadCurrentUser();
      } catch (error) {
        console.error('Failed to load user from server:', error);
        // Don't throw - let the auth guard handle this
      }
    }
  }

  async login(username: string, password: string): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'server') {
      return this.userService.login(username, password);
    }
    throw new Error('Login not available in offline mode');
  }

  async logout(): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      this.localUserService.clearLocalUser();
      await this.router.navigate(['/setup']);
    } else if (mode === 'server') {
      return this.userService.logout();
    }
  }

  async updateUser(updates: Partial<User>): Promise<void> {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      this.localUserService.updateLocalUser(updates);
    } else if (mode === 'server') {
      const current = this.userService.currentUser();
      const updated = { ...current, ...updates };
      await this.userService.setCurrentUser(updated);
    }
  }

  async hasCachedUser(): Promise<boolean> {
    const mode = this.setupService.getMode();
    if (mode === 'local') {
      return Promise.resolve(this.localUserService.hasCachedUser());
    } else if (mode === 'server') {
      return this.userService.hasCachedUser();
    }
    return false;
  }

  getMode(): 'server' | 'local' | null {
    return this.setupService.getMode();
  }
}
