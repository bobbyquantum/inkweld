import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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
  private dialog = inject(MatDialog);
  private userApi = inject(UserAPIService);
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  /**
   * Opens the user settings dialog
   * @returns Observable that emits when the dialog is closed
   */
  openSettingsDialog(): Observable<void> {
    return this.dialog
      .open(UserSettingsDialogComponent, {
        width: '700px',
      })
      .afterClosed() as Observable<void>;
  }

  /**
   * Gets the current user, first checking the local cache and falling back to the API
   * if no cached data is available
   * @returns Observable that emits the current user data
   */
  getCurrentUser(): Observable<UserDto> {
    return from(this.getDB()).pipe(
      switchMap(db => {
        return new Promise<UserDto | null>(resolve => {
          // Create a read-only transaction and access the object store
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          // Get the cached user data
          const request = store.get(CACHE_KEY);

          // Handle successful data retrieval
          request.onsuccess = () => {
            if (request.result) {
              resolve(request.result as UserDto);
            } else {
              resolve(null);
            }
          };
          request.onerror = () => resolve(null);
        });
      }),
      switchMap(cachedUser => {
        if (cachedUser) {
          return of(cachedUser);
        }
        return this.userApi.userControllerGetMe().pipe(
          switchMap(user => {
            if (user) {
              void this.setCurrentUser(user);
            }
            return of(user);
          })
        );
      })
    );
  }

  /**
   * Sets the current user in the local cache
   * @param user - The user data to cache
   * @returns Promise that resolves when the user data is successfully cached
   */
  async setCurrentUser(user: UserDto): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(user, CACHE_KEY);
  }

  /**
   * Clears the current user from the local cache
   * @returns Promise that resolves when the user data is successfully cleared
   */
  async clearCurrentUser(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(CACHE_KEY);
  }

  /**
   * Initializes the IndexedDB database
   * @returns Promise that resolves with the database instance
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
   * @returns Promise that resolves with the database instance
   */
  private getDB(): Promise<IDBDatabase> {
    return this.dbPromise;
  }
}
