import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { UserAPIService } from '../../api-client/api/user-api.service';
import { UserDto } from '../../api-client/model/user-dto';

const DB_NAME = 'userCache';
const STORE_NAME = 'users';
const CACHE_KEY = 'currentUser';

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

  openSettingsDialog(): Observable<void> {
    return this.dialog
      .open(UserSettingsDialogComponent, {
        width: '700px',
      })
      .afterClosed() as Observable<void>;
  }

  getCurrentUser(): Observable<UserDto> {
    return from(this.getDB()).pipe(
      switchMap(db => {
        return new Promise<UserDto | null>(resolve => {
          const transaction = db.transaction(STORE_NAME, 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(CACHE_KEY);

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

  async setCurrentUser(user: UserDto): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(user, CACHE_KEY);
  }

  async clearCurrentUser(): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(CACHE_KEY);
  }

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
  private getDB(): Promise<IDBDatabase> {
    return this.dbPromise;
  }
}
