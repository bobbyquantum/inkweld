import { Injectable, signal } from '@angular/core';

import { UserDto } from '../../api-client/model/user-dto';
import { SetupService } from './setup.service';

const OFFLINE_USER_STORAGE_KEY = 'inkweld-offline-user';

@Injectable({
  providedIn: 'root',
})
export class OfflineUserService {
  readonly currentUser = signal<UserDto>({
    name: 'anonymous',
    username: 'anonymous',
  });

  readonly isLoading = signal(false);
  readonly isAuthenticated = signal(false);
  readonly initialized = signal(false);

  constructor(private setupService: SetupService) {
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
  setOfflineUser(user: UserDto): void {
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    this.saveOfflineUser(user);
  }

  /**
   * Update the offline user profile
   */
  updateOfflineUser(updates: Partial<UserDto>): void {
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
      name: 'anonymous',
      username: 'anonymous',
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
        const user = JSON.parse(stored) as UserDto;
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('Failed to load offline user:', error);
    }
    this.initialized.set(true);
  }

  private saveOfflineUser(user: UserDto): void {
    try {
      localStorage.setItem(OFFLINE_USER_STORAGE_KEY, JSON.stringify(user));
    } catch (error) {
      console.error('Failed to save offline user:', error);
    }
  }
}
