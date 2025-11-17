import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { AuthenticationService } from '@inkweld/index';
import {
  catchError,
  firstValueFrom,
  Observable,
  retry,
  throwError,
} from 'rxjs';

import { UsersService } from '../../api-client/api/users.service';
import { User } from '../../api-client/model/user';
import { LoggerService } from './logger.service';
import { StorageService } from './storage.service';
import { XsrfService } from './xsrf.service';

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
  private readonly AuthenticationService = inject(AuthenticationService);
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
        this.userAPI.getApiV1UsersMe().pipe(
          retry(MAX_RETRIES),
          catchError((error: unknown) => {
            const userError = this.formatError(error);
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
        this.AuthenticationService.postApiV1AuthLogin({
          username,
          password,
        })
      );

      // Store JWT token in localStorage
      if ('token' in response && typeof response.token === 'string') {
        localStorage.setItem('auth_token', response.token);
      }

      await this.setCurrentUser(response.user);
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
    // Clear JWT token from localStorage
    localStorage.removeItem('inkweld-app-config');
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
      await firstValueFrom(this.AuthenticationService.postApiV1AuthLogout());
      await this.clearCurrentUser();
      await this.router.navigate(['/welcome']);
    } catch (err) {
      const error = this.formatError(err);
      this.error.set(error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  getUserAvatar(username: string): Observable<Blob> {
    return this.userAPI.getApiV1UsersUsernameAvatar(username);
  }

  uploadAvatar(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('avatar', file);
    const url = `${this.userAPI.configuration.basePath}/api/v1/users/avatar`;
    return this.http.post<void>(url, formData, {
      withCredentials: true,
    });
  }

  deleteAvatar(): Observable<void> {
    const url = `${this.userAPI.configuration.basePath}/api/v1/users/avatar/delete`;
    return this.http.post<void>(
      url,
      {},
      {
        withCredentials: true,
      }
    );
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
      if (error.status === 403) {
        // Check if this is a pending approval error
        const errorBody = error.error as
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
