import { inject, Injectable, signal } from '@angular/core';

import { User } from '../../api-client/model/user';
import { SetupService } from './setup.service';

const OFFLINE_USER_STORAGE_KEY = 'inkweld-offline-user';

@Injectable({
  providedIn: 'root',
})
export class OfflineUserService {
  private setupService = inject(SetupService);

  readonly currentUser = signal<User>({
    id: '',
    name: 'anonymous',
    username: 'anonymous',
    enabled: false,
  });

  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly initialized = signal(false);

  constructor() {
    this.loadOfflineUser();
  }

  /**
   * Initialize offline user from setup configuration
   */
  initializeFromSetup(): void {
    const userProfile = this.setupService.getOfflineUserProfile();
    if (userProfile) {
      this.currentUser.set(userProfile);
      this.isAuthenticated.set(true);
      this.saveOfflineUser(userProfile);
    }
    this.initialized.set(true);
  }

  /**
   * Set the offline user profile
   */
  setOfflineUser(user: User): void {
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    this.saveOfflineUser(user);
  }

  /**
   * Update the offline user profile
   */
  updateOfflineUser(updates: Partial<User>): void {
    const current = this.currentUser();
    const updated = { ...current, ...updates };
    this.currentUser.set(updated);
    this.saveOfflineUser(updated);
  }

  /**
   * Clear the offline user
   */
  clearOfflineUser(): void {
    this.currentUser.set({
      id: '',
      name: 'anonymous',
      username: 'anonymous',
      enabled: false,
    });
    this.isAuthenticated.set(false);
    localStorage.removeItem(OFFLINE_USER_STORAGE_KEY);
  }

  /**
   * Check if there's a cached offline user
   */
  hasCachedUser(): boolean {
    const stored = localStorage.getItem(OFFLINE_USER_STORAGE_KEY);
    return !!stored;
  }

  private loadOfflineUser(): void {
    try {
      const stored = localStorage.getItem(OFFLINE_USER_STORAGE_KEY);
      if (stored) {
        const user = JSON.parse(stored) as User;
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('Failed to load offline user:', error);
    }
    this.initialized.set(true);
  }

  private saveOfflineUser(user: User): void {
    try {
      localStorage.setItem(OFFLINE_USER_STORAGE_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Failed to save offline user:', error);
    }
  }
}




