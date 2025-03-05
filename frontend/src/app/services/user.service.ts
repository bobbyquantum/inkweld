import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { AuthService } from '@inkweld/index';
import { catchError, firstValueFrom, retry, throwError } from 'rxjs';

import { UserAPIService } from '../../api-client/api/user-api.service';
import { UserDto } from '../../api-client/model/user-dto';
import { environment } from '../../environments/environment';
import { StorageService } from './storage.service';

export class UserServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'SESSION_EXPIRED'
      | 'SERVER_ERROR'
      | 'LOGIN_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

const USER_CACHE_CONFIG = {
  dbName: 'userCache',
  version: 1,
  stores: {
    users: null,
  },
} as const;

const CACHE_KEY = 'currentUser';
const MAX_RETRIES = 3;

@Injectable({
  providedIn: 'root',
})
export class UserService {
  readonly currentUser = signal<UserDto | undefined>(undefined);
  readonly isLoading = signal(false);
  readonly error = signal<UserServiceError | undefined>(undefined);
  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly initialized = signal(false);

  private readonly dialog = inject(MatDialog);
  private readonly userApi = inject(UserAPIService);
  private readonly authService = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = this.storage
      .initializeDatabase(USER_CACHE_CONFIG)
      .catch(error => {
        console.error('User cache initialization failed:', error);
        throw new UserServiceError(
          'SERVER_ERROR',
          'Failed to initialize user cache'
        );
      });
  }

  async openSettingsDialog(): Promise<void> {
    this.isLoading.set(true);
    try {
      await firstValueFrom(
        this.dialog
          .open(UserSettingsDialogComponent, {
            width: '700px',
            disableClose: true,
          })
          .afterClosed()
      );
    } catch (error) {
      console.error('Settings dialog error:', error);
      throw new UserServiceError(
        'SERVER_ERROR',
        'Failed to open settings dialog'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async hasCachedUser(): Promise<boolean> {
    if (!this.storage.isAvailable()) {
      return false;
    }
    const cachedUser = await this.getCachedUser();
    return !!cachedUser;
  }

  async loadCurrentUser(): Promise<void> {
    if (!this.initialized()) {
      this.initialized.set(true);
    }

    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // Try cached user first if storage is available
      if (this.storage.isAvailable()) {
        const cachedUser = await this.getCachedUser();
        if (cachedUser) {
          this.currentUser.set(cachedUser);
          return;
        }
      }

      // Fallback to API with retry mechanism
      const user = await firstValueFrom(
        this.userApi.userControllerGetMe().pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const userError = this.formatError(error);
            this.error.set(userError);
            return throwError(() => userError);
          })
        )
      );
      console.log('User result', user);
      if (user) {
        console.log('Saving user', user);
        await this.setCurrentUser(user);
      }
    } catch (err) {
      const error =
        err instanceof UserServiceError
          ? err
          : new UserServiceError('SERVER_ERROR', 'Failed to load user data');
      this.error.set(error);
      console.error('User loading error:', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async setCurrentUser(user: UserDto): Promise<void> {
    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.put(db, 'users', user, CACHE_KEY);
      } catch (error) {
        console.warn('Failed to cache user:', error);
      }
    }
    this.currentUser.set(user);
  }

  async login(username: string, password: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      this.authService.authControllerLogin({ username, password });
      const user = await firstValueFrom(
        this.http.post<UserDto>(
          `${environment.apiUrl}/login`,
          {
            username,
            password,
          },
          { withCredentials: true }
        )
      );

      await this.setCurrentUser(user);
      await this.router.navigate(['/']);
    } catch (err) {
      const error = this.formatError(err);
      this.error.set(error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async clearCurrentUser(): Promise<void> {
    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.delete(db, 'users', CACHE_KEY);
      } catch (error) {
        console.warn('Failed to clear cached user:', error);
      }
    }
    this.currentUser.set(undefined);
  }

  private formatError(error: unknown): UserServiceError {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return new UserServiceError('NETWORK_ERROR', 'Server unavailable');
      }
      if (error.status === 401) {
        // Check for specific login failure case
        const errorBody = error.error as
          | {
              message: string;
              error: string;
              statusCode: number;
            }
          | undefined;

        if (
          errorBody?.message === 'Invalid username or password' &&
          errorBody.error === 'Unauthorized' &&
          errorBody.statusCode === 401
        ) {
          return new UserServiceError(
            'LOGIN_FAILED',
            'Invalid username or password'
          );
        }
        // Other 401 errors are treated as session expired
        return new UserServiceError('SESSION_EXPIRED', 'Session expired');
      }
    }
    return new UserServiceError('SERVER_ERROR', 'Failed to load user data');
  }

  private async getCachedUser(): Promise<UserDto | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<UserDto>(db, 'users', CACHE_KEY);
    } catch (error) {
      console.warn('Failed to get cached user:', error);
      return undefined;
    }
  }
}
