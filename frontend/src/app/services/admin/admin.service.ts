import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import {
  AdminListUsers200ResponseInner,
  AdminService as ApiAdminService,
} from '@inkweld/index';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';

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

// Re-export the generated type with a cleaner alias
export type AdminUser = AdminListUsers200ResponseInner;

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private readonly apiService = inject(ApiAdminService);
  private readonly logger = inject(LoggerService);

  readonly users = signal<AdminUser[]>([]);
  readonly pendingUsers = signal<AdminUser[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<AdminServiceError | undefined>(undefined);

  /**
   * Fetch all users (admin only)
   */
  async listUsers(): Promise<AdminUser[]> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const response = await firstValueFrom(
        this.apiService
          .adminListUsers()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.users.set(response);
      return response;
    } catch (error) {
      this.logger.error('AdminService', 'Failed to list users', error);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Fetch pending users awaiting approval (admin only)
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

    if (error.error instanceof ErrorEvent) {
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
