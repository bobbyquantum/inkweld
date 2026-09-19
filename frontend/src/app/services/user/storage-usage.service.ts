import { inject, Injectable, signal } from '@angular/core';
import { type StorageUsage, UsersService } from '@inkweld/index';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';

/** Re-export the generated model under the name the UI already imports. */
export type { StorageUsage };
export type StorageUsageProject = StorageUsage['projects'][number];

export class StorageUsageError extends Error {
  constructor(
    public code: 'NETWORK_ERROR' | 'UNAUTHORIZED' | 'SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'StorageUsageError';
  }
}

/**
 * Reads the current user's sync-capacity usage via the generated API client.
 *
 * Usage is per-account, so the cached value is keyed by user id: a value fetched
 * for one user must never be shown to the next person to sign in on the same SPA
 * session.
 */
@Injectable({
  providedIn: 'root',
})
export class StorageUsageService {
  private readonly usersApi = inject(UsersService);
  private readonly logger = inject(LoggerService);

  /** Last fetched usage; `undefined` until the first successful load. */
  readonly usage = signal<StorageUsage | undefined>(undefined);
  readonly isLoading = signal(false);
  readonly error = signal<StorageUsageError | undefined>(undefined);

  /** The user the cached `usage` belongs to. */
  private cachedForUserId: string | undefined;

  /**
   * Fetch fresh usage. Never throws — failures are recorded in `error` so a UI
   * meter can degrade quietly rather than break the page it sits on.
   */
  async load(userId?: string): Promise<StorageUsage | undefined> {
    // Different account (or a sign-out/sign-in) — the previous value is not
    // this user's, so clear it rather than briefly showing it to them.
    if (
      userId !== undefined &&
      this.cachedForUserId !== undefined &&
      userId !== this.cachedForUserId
    ) {
      this.reset();
    }
    if (userId !== undefined) {
      this.cachedForUserId = userId;
    }

    this.isLoading.set(true);
    this.error.set(undefined);
    try {
      const usage = await firstValueFrom(
        this.usersApi
          .getMyStorageUsage()
          .pipe(catchError(this.handleError.bind(this)))
      );
      this.usage.set(usage);
      return usage;
    } catch (error) {
      // Already logged in handleError; keep the previous value so the meter
      // does not blink to zero on a transient failure.
      this.error.set(error as StorageUsageError);
      return undefined;
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Clear cached state (e.g. on sign-out). */
  reset(): void {
    this.usage.set(undefined);
    this.error.set(undefined);
    this.cachedForUserId = undefined;
  }

  private handleError(error: unknown) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: number }).status
        : undefined;

    let serviceError: StorageUsageError;
    if (status === 0 || status === undefined) {
      serviceError = new StorageUsageError(
        'NETWORK_ERROR',
        'Unable to connect to server'
      );
    } else if (status === 401) {
      serviceError = new StorageUsageError('UNAUTHORIZED', 'Not authenticated');
    } else {
      serviceError = new StorageUsageError(
        'SERVER_ERROR',
        'Failed to load storage usage'
      );
    }
    this.logger.error(
      'StorageUsageService',
      'Failed to load storage usage',
      error
    );
    return throwError(() => serviceError);
  }
}
