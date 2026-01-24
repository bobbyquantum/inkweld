import { inject, Injectable, signal } from '@angular/core';
import { User } from '@inkweld/index';

import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';

const LOCAL_USER_BASE_KEY = 'inkweld-local-user';

@Injectable({
  providedIn: 'root',
})
export class LocalUserService {
  private setupService = inject(SetupService);
  private storageContext = inject(StorageContextService);

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
    this.loadLocalUser();
  }

  /**
   * Get the prefixed storage key for the current context
   */
  private get storageKey(): string {
    return this.storageContext.prefixKey(LOCAL_USER_BASE_KEY);
  }

  /**
   * Initialize local user from setup configuration
   */
  initializeFromSetup(): void {
    const userProfile = this.setupService.getLocalUserProfile();
    if (userProfile) {
      this.currentUser.set(userProfile);
      this.isAuthenticated.set(true);
      this.saveLocalUser(userProfile);
    }
    this.initialized.set(true);
  }

  /**
   * Set the local user profile
   */
  setLocalUser(user: User): void {
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    this.saveLocalUser(user);
  }

  /**
   * Update the local user profile
   */
  updateLocalUser(updates: Partial<User>): void {
    const current = this.currentUser();
    const updated = { ...current, ...updates };
    this.currentUser.set(updated);
    this.saveLocalUser(updated);
  }

  /**
   * Clear the local user
   */
  clearLocalUser(): void {
    this.currentUser.set({
      id: '',
      name: 'anonymous',
      username: 'anonymous',
      enabled: false,
    });
    this.isAuthenticated.set(false);
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Check if there's a cached local user
   */
  hasCachedUser(): boolean {
    const stored = localStorage.getItem(this.storageKey);
    return !!stored;
  }

  private loadLocalUser(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const user = JSON.parse(stored) as User;
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }
    } catch (error) {
      console.error('Failed to load local user:', error);
    }
    this.initialized.set(true);
  }

  private saveLocalUser(user: User): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(user));
    } catch (error) {
      console.error('Failed to save local user:', error);
    }
  }
}
