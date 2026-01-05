import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { AuthenticationService, User, UsersService } from '@inkweld/index';
import {
  catchError,
  firstValueFrom,
  Observable,
  retry,
  throwError,
} from 'rxjs';

import { XsrfService } from '../auth/xsrf.service';
import { LoggerService } from '../core/logger.service';
import { StorageService } from '../offline/storage.service';

export class UserServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'SESSION_EXPIRED'
      | 'SERVER_ERROR'
      | 'LOGIN_FAILED'
      | 'ACCOUNT_PENDING'
      | 'ACCESS_DENIED',
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
  private readonly dialog = inject(MatDialog);
  private readonly http = inject(HttpClient);
  private readonly userAPI = inject(UsersService);
  private readonly xsrfService = inject(XsrfService);
  private readonly authenticationService = inject(AuthenticationService);
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  private readonly logger = inject(LoggerService);

  readonly currentUser = signal<User>({
    id: '',
    name: 'anonymous',
    username: 'anonymous',
    enabled: false,
  });
  readonly isLoading = signal(false);
  readonly error = signal<UserServiceError | undefined>(undefined);
  readonly isAuthenticated = computed(
    () => !!this.currentUser() && this.currentUser().username !== 'anonymous'
  );
  readonly initialized = signal(false);

  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = this.storage
      .initializeDatabase(USER_CACHE_CONFIG)
      .catch(error => {
        this.logger.error(
          'UserService',
          'User cache initialization failed',
          error
        );
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
      this.logger.error('UserService', 'Settings dialog error', error);
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
      let cachedUser: User | undefined;

      // Try cached user first if storage is available - show immediately for fast UI
      if (this.storage.isAvailable()) {
        cachedUser = await this.getCachedUser();
        if (cachedUser) {
          this.currentUser.set(cachedUser);
          // Don't return - continue to validate/refresh from server
        }
      }

      // Always try to fetch from API to validate session and get fresh data
      try {
        const user = await firstValueFrom(
          this.userAPI.getCurrentUser().pipe(
            retry(MAX_RETRIES),
            catchError((error: unknown) => {
              const userError = this.formatError(error);
              // If we have cached user and it's a network/server error, use cache
              if (
                cachedUser &&
                (userError.code === 'NETWORK_ERROR' ||
                  userError.code === 'SERVER_ERROR')
              ) {
                this.logger.warn(
                  'UserService',
                  'Server unavailable, using cached user'
                );
                return throwError(
                  () => new Error('Refresh failed, using cache')
                );
              }
              // For auth errors (SESSION_EXPIRED, ACCESS_DENIED), clear cache and propagate
              this.error.set(userError);
              return throwError(() => userError);
            })
          )
        );
        this.logger.debug('UserService', 'User result', user);
        if (user) {
          this.logger.debug('UserService', 'Saving user', user);
          await this.setCurrentUser(user);
        }
      } catch (refreshErr) {
        // If refresh failed but we have cache (network issue), that's OK
        const canRecover =
          refreshErr instanceof Error &&
          refreshErr.message === 'Refresh failed, using cache';
        if (canRecover && cachedUser) {
          this.logger.info(
            'UserService',
            'Using cached user due to network error'
          );
          // User already set from cache above, continue
        } else if (!canRecover) {
          // Re-throw auth errors and other non-recoverable errors
          throw refreshErr;
        }
      }
    } catch (err) {
      const error =
        err instanceof UserServiceError
          ? err
          : new UserServiceError('SERVER_ERROR', 'Failed to load user data');
      this.error.set(error);
      this.logger.error('UserService', 'User loading error', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  async setCurrentUser(user: User): Promise<void> {
    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.put(db, 'users', user, CACHE_KEY);
      } catch (error) {
        this.logger.warn('UserService', 'Failed to cache user', error);
      }
    }
    this.currentUser.set(user);
  }

  async login(username: string, password: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const response = await firstValueFrom(
        this.authenticationService.login({
          username,
          password,
        })
      );

      // Store JWT token in localStorage
      if ('token' in response && typeof response.token === 'string') {
        localStorage.setItem('auth_token', response.token);
      }

      if ('user' in response && response.user) {
        await this.setCurrentUser(response.user);
      }
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
    // Clear JWT token from localStorage (but keep app config for setup)
    localStorage.removeItem('auth_token');

    if (this.storage.isAvailable()) {
      try {
        const db = await this.db;
        await this.storage.delete(db, 'users', CACHE_KEY);
      } catch (error) {
        this.logger.warn('UserService', 'Failed to clear cached user', error);
      }
    }
    this.currentUser.set({
      id: '',
      name: 'anonymous',
      username: 'anonymous',
      enabled: false,
    });
  }

  async logout(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.authenticationService.logout() as Observable<any>
      );
      await this.clearCurrentUser();
      await this.router.navigate(['/']);
    } catch (err) {
      const error = this.formatError(err);
      this.error.set(error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  getUserAvatar(username: string): Observable<Blob> {
    return this.userAPI.getUserAvatar(username);
  }

  uploadAvatar(file: File): Observable<unknown> {
    // Note: File upload still uses HttpClient as generated client may not handle FormData properly
    const formData = new FormData();
    formData.append('avatar', file);
    const url = `${this.userAPI.configuration.basePath}/api/v1/users/avatar`;
    return this.http.post(url, formData, {
      withCredentials: true,
    });
  }

  deleteAvatar(): Observable<unknown> {
    return this.userAPI.deleteUserAvatar();
  }

  private formatError(error: unknown): UserServiceError {
    // Check if error has HttpErrorResponse-like structure
    const isHttpError =
      error instanceof HttpErrorResponse ||
      (error != null &&
        typeof error === 'object' &&
        'status' in error &&
        'error' in error);

    if (isHttpError) {
      const httpError = error as HttpErrorResponse;
      if (httpError.status === 0) {
        return new UserServiceError('NETWORK_ERROR', 'Server unavailable');
      }
      if (httpError.status === 401) {
        // Check for specific login failure case
        const errorBody = httpError.error as
          | {
              message?: string;
              error?: string;
              statusCode?: number;
            }
          | undefined;

        // Handle both error response formats
        if (
          errorBody?.error === 'Invalid credentials' ||
          errorBody?.message === 'Invalid credentials' ||
          (errorBody?.message === 'Invalid username or password' &&
            errorBody.error === 'Unauthorized')
        ) {
          return new UserServiceError(
            'LOGIN_FAILED',
            'Invalid username or password'
          );
        }
        // Other 401 errors are treated as session expired
        return new UserServiceError('SESSION_EXPIRED', 'Session expired');
      }
      if (httpError.status === 403) {
        // Check if this is a pending approval error
        const errorBody = httpError.error as
          | {
              message: string;
              error: string;
              statusCode: number;
            }
          | undefined;

        if (
          errorBody?.message?.includes('pending approval') ||
          errorBody?.message?.includes('disabled')
        ) {
          return new UserServiceError('ACCOUNT_PENDING', errorBody.message);
        }
        return new UserServiceError('ACCESS_DENIED', 'Access denied');
      }
    }
    return new UserServiceError('SERVER_ERROR', 'Failed to load user data');
  }

  private async getCachedUser(): Promise<User | undefined> {
    try {
      const db = await this.db;
      return await this.storage.get<User>(db, 'users', CACHE_KEY);
    } catch (error) {
      this.logger.warn('UserService', 'Failed to get cached user', error);
      return undefined;
    }
  }
}
