import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { AdminService as ApiAdminService } from '@inkweld/index';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';

export class AdminServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'AdminServiceError';
  }
}

// Admin user type - extends User with admin-specific fields that are only returned for admins
export interface AdminUser {
  id: string;
  username: string;
  name?: string | null;
  email?: string;
  enabled: boolean;
  approved?: boolean;
  isAdmin?: boolean;
  githubId?: string | null;
}

export interface PaginatedUsersResponse {
  users: AdminUser[];
  total: number;
  hasMore: boolean;
}

export interface ListUsersOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly apiService = inject(ApiAdminService);
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  private get basePath(): string {
    // Always use the configured server URL if available
    // This ensures API calls work both in dev (with proxy) and production (separate servers)
    return this.setupService.getServerUrl() ?? '';
  }

  readonly users = signal<AdminUser[]>([]);
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly totalUsers = signal(0);
  readonly hasMoreUsers = signal(false);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly error = signal<AdminServiceError | undefined>(undefined);

  /**
   * Fetch all users with pagination and search (admin only)
   * Uses /api/v1/users which returns full details for admin users
   */
  async listUsers(options?: ListUsersOptions): Promise<PaginatedUsersResponse> {
    const isLoadMore = (options?.offset ?? 0) > 0;

    if (isLoadMore) {
      this.isLoadingMore.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.error.set(undefined);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (options?.search) params.set('search', options.search);
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.offset) params.set('offset', options.offset.toString());

      const queryString = params.toString();
      // Use the standard users endpoint - admins get full details automatically
      const url = `${this.basePath}/api/v1/users${queryString ? `?${queryString}` : ''}`;

      const response = await firstValueFrom(
        this.http
          .get<PaginatedUsersResponse>(url, { withCredentials: true })
          .pipe(catchError(this.handleError.bind(this)))
      );

      if (isLoadMore) {
        // Append to existing users
        this.users.update(current => [...current, ...response.users]);
      } else {
        // Replace users
        this.users.set(response.users);
      }

      this.totalUsers.set(response.total);
      this.hasMoreUsers.set(response.hasMore);

      return response;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to list users', error);
      throw error;
    } finally {
      this.isLoading.set(false);
      this.isLoadingMore.set(false);
    }
  }

  /**
   * Fetch pending users awaiting approval (admin only)
   * Note: When called standalone, this manages its own loading state.
   * For combined loading, use loadAllUsers() instead.
   */
  async listPendingUsers(): Promise<AdminUser[]> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const response = await firstValueFrom(
        this.apiService
          .adminListPendingUsers()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.pendingUsers.set(response);
      return response;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to list pending users', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Load all users and pending users in a single operation.
   * This properly manages loading state to avoid race conditions when
   * both listUsers and listPendingUsers are called concurrently.
   */
  async loadAllUsers(options?: ListUsersOptions): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      // Fetch both in parallel but manage loading state once
      const [usersResult, pendingResult] = await Promise.all([
        this.fetchUsers(options),
        this.fetchPendingUsers(),
      ]);

      // Update state only after both succeed
      this.users.set(usersResult.users);
      this.totalUsers.set(usersResult.total);
      this.hasMoreUsers.set(usersResult.hasMore);
      this.pendingUsers.set(pendingResult);
    } catch (error) {
      this.logger.error('AdminService', 'Failed to load all users', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Internal method to fetch users without managing loading state.
   */
  private async fetchUsers(
    options?: ListUsersOptions
  ): Promise<PaginatedUsersResponse> {
    const params = new URLSearchParams();
    if (options?.search) params.set('search', options.search);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `${this.basePath}/api/v1/users${queryString ? `?${queryString}` : ''}`;

    return firstValueFrom(
      this.http
        .get<PaginatedUsersResponse>(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  /**
   * Internal method to fetch pending users without managing loading state.
   */
  private async fetchPendingUsers(): Promise<AdminUser[]> {
    return firstValueFrom(
      this.apiService
        .adminListPendingUsers()
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  /**
   * Approve a pending user (admin only)
   */
  async approveUser(userId: string): Promise<AdminUser> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const user = await firstValueFrom(
        this.apiService
          .adminApproveUser(userId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state - remove from pending, update in users
      this.pendingUsers.update(users => users.filter(u => u.id !== userId));
      this.users.update(users => users.map(u => (u.id === userId ? user : u)));

      return user;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to approve user', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Reject a pending user (admin only)
   */
  async rejectUser(userId: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        this.apiService
          .adminRejectUser(userId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state - remove from pending and users
      this.pendingUsers.update(users => users.filter(u => u.id !== userId));
      this.users.update(users => users.filter(u => u.id !== userId));
    } catch (error) {
      this.logger.error('AdminService', 'Failed to reject user', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Enable a user (admin only)
   */
  async enableUser(userId: string): Promise<AdminUser> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const user = await firstValueFrom(
        this.apiService
          .adminEnableUser(userId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.users.update(users => users.map(u => (u.id === userId ? user : u)));

      return user;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to enable user', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Disable a user (admin only)
   */
  async disableUser(userId: string): Promise<AdminUser> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const user = await firstValueFrom(
        this.apiService
          .adminDisableUser(userId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.users.update(users => users.map(u => (u.id === userId ? user : u)));

      return user;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to disable user', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Set admin status for a user (admin only)
   */
  async setUserAdmin(userId: string, isAdmin: boolean): Promise<AdminUser> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const user = await firstValueFrom(
        this.apiService
          .adminSetUserAdmin(userId, { isAdmin })
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.users.update(users => users.map(u => (u.id === userId ? user : u)));

      return user;
    } catch (error) {
      this.logger.error(
        'AdminService',
        'Failed to set user admin status',
        error
      );
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Delete a user (admin only)
   */
  async deleteUser(userId: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        this.apiService
          .adminDeleteUser(userId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state - remove from both lists
      this.pendingUsers.update(users => users.filter(u => u.id !== userId));
      this.users.update(users => users.filter(u => u.id !== userId));
    } catch (error) {
      this.logger.error('AdminService', 'Failed to delete user', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  private handleError(error: HttpErrorResponse) {
    let serviceError: AdminServiceError;

    if (error.status === 0) {
      // Network error (connection refused, CORS, offline, etc.)
      serviceError = new AdminServiceError(
        'NETWORK_ERROR',
        'Unable to connect to server'
      );
    } else if (error.error instanceof ErrorEvent) {
      // Client-side error
      serviceError = new AdminServiceError(
        'NETWORK_ERROR',
        error.error.message
      );
    } else {
      // Server-side error
      switch (error.status) {
        case 401:
          serviceError = new AdminServiceError(
            'UNAUTHORIZED',
            'Not authenticated'
          );
          break;
        case 403:
          serviceError = new AdminServiceError(
            'FORBIDDEN',
            'Admin access required'
          );
          break;
        case 404:
          serviceError = new AdminServiceError('NOT_FOUND', 'User not found');
          break;
        default: {
          const serverError = error.error as { error?: string } | undefined;
          serviceError = new AdminServiceError(
            'SERVER_ERROR',
            serverError?.error ?? 'An unexpected error occurred'
          );
        }
      }
    }

    this.error.set(serviceError);
    return throwError(() => serviceError);
  }
}
