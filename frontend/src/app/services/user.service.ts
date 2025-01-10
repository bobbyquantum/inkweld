import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { firstValueFrom } from 'rxjs';

import { UserAPIService } from '../../api-client/api/user-api.service';
import { UserDto } from '../../api-client/model/user-dto';

/**
 * Name of the IndexedDB database used for user caching
 */
const DB_NAME = 'userCache';

/**
 * Name of the object store within IndexedDB where user data is stored
 */
const STORE_NAME = 'users';

/**
 * Key used to store the current user in the IndexedDB object store
 */
const CACHE_KEY = 'currentUser';

/**
 * Service for managing user-related operations including:
 * - Caching user data in IndexedDB
 * - Managing user settings dialog
 * - Providing access to current user information
 *
 * Uses IndexedDB for offline persistence and caching of user data,
 * with fallback to API calls when cached data is not available.
 */
@Injectable({
  providedIn: 'root',
})
export class UserService {
  /** The current user data */
  readonly currentUser = signal<UserDto | undefined>(undefined);

  /** Whether user data is being loaded */
  readonly isLoading = signal(false);

  /** Error message if user loading fails */
  readonly error = signal<string | undefined>(undefined);

  /** Computed property for user authentication state */
  readonly isAuthenticated = computed(() => !!this.currentUser());

  private dialog = inject(MatDialog);
  private userApi = inject(UserAPIService);
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  /**
   * Opens the user settings dialog
   */
  async openSettingsDialog(): Promise<void> {
    await firstValueFrom(
      this.dialog
        .open(UserSettingsDialogComponent, {
          width: '700px',
        })
        .afterClosed()
    );
  }

  /**
   * Loads the current user from cache or API
   */
  async loadCurrentUser(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // Try to load from cache first
      const cachedUser = await this.getCachedUser();
      if (cachedUser) {
        this.currentUser.set(cachedUser);
        return;
      }

      // Fall back to API if no cached user
      const user = await firstValueFrom(this.userApi.userControllerGetMe());
      if (user) {
        this.currentUser.set(user);
        await this.setCurrentUser(user);
      }
    } catch (err) {
      this.error.set('Failed to load user data');
      console.error('Error loading user:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Sets the current user in the local cache
   * @param user - The user data to cache
   */
  async setCurrentUser(user: UserDto): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(user, CACHE_KEY);
    this.currentUser.set(user);
  }

  /**
   * Clears the current user from the local cache
   */
  async clearCurrentUser(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(CACHE_KEY);
    this.currentUser.set(undefined);
  }
  /**
   * Gets the cached user from IndexedDB
   */
  private async getCachedUser(): Promise<UserDto | undefined> {
    const db = await this.getDB();
    return new Promise<UserDto | undefined>(resolve => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);

      request.onsuccess = () => resolve(request.result as UserDto);
      request.onerror = () => resolve(undefined);
    });
  }
  /**
   * Initializes the IndexedDB database
   */
  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error as Error);
    });
  }

  /**
   * Gets the initialized IndexedDB database instance
   */
  private getDB(): Promise<IDBDatabase> {
    return this.dbPromise;
  }
}
