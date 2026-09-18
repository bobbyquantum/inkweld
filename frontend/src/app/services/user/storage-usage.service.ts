import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';

/** Per-project slice of a user's storage usage. */
export interface StorageUsageProject {
  id: string;
  slug: string;
  title: string;
  dataBytes: number;
  mediaBytes: number;
  totalBytes: number;
}

/** A user's sync-capacity usage and allowance. */
export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  /** used/quota, or `null` when the allowance is zero (nothing fits). */
  fraction: number | null;
  overQuota: boolean;
  overSoftLimit: boolean;
  projects: StorageUsageProject[];
}

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
 * Reads the current user's sync-capacity usage.
 *
 * This is deliberately a hand-written HTTP call rather than a generated
 * api-client method: the Angular client is produced by a Java tool that is not
 * available in every build environment, and the endpoint is a simple
 * authenticated GET. If the client is later regenerated, this can switch to the
 * generated `getMyStorageUsage` without changing the public surface here.
 */
@Injectable({
  providedIn: 'root',
})
export class StorageUsageService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  /** Last fetched usage; `undefined` until the first successful load. */
  readonly usage = signal<StorageUsage | undefined>(undefined);
  readonly isLoading = signal(false);
  readonly error = signal<StorageUsageError | undefined>(undefined);

  /**
   * The user the cached `usage` belongs to. Usage is per-account, so a cached
   * value must never be shown to a different user after a sign-out/sign-in in
   * the same SPA session — `load` drops it when the id changes.
   */
  private cachedForUserId: string | undefined;

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

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
        this.http
          .get<StorageUsage>(`${this.basePath}/api/v1/users/me/storage`, {
            withCredentials: true,
          })
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

  private handleError(error: HttpErrorResponse) {
    let serviceError: StorageUsageError;
    if (error.status === 0) {
      serviceError = new StorageUsageError(
        'NETWORK_ERROR',
        'Unable to connect to server'
      );
    } else if (error.status === 401) {
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
