import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { type StorageUsage, UsersService } from '@inkweld/index';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';

/** Re-export the generated model under the name the UI already imports. */
export type { StorageUsage };
export type StorageUsageProject = StorageUsage['projects'][number];

/** Body of a sync-capacity refusal (HTTP 403, `code: 'QUOTA_EXCEEDED'`). */
export interface QuotaExceededDetails {
  code: 'QUOTA_EXCEEDED';
  usedBytes: number;
  quotaBytes: number;
  requiredBytes?: number;
  reason: 'media_upload' | 'project_create' | 'published_file';
}

/**
 * The server's sync-capacity refusal, or `undefined` for any other error.
 *
 * Distinguishes a quota 403 from an access-control 403 by its `code`, so a
 * caller can explain the limit instead of reporting "access denied".
 */
export function getQuotaExceeded(
  error: unknown
): QuotaExceededDetails | undefined {
  if (!(error instanceof HttpErrorResponse) || error.status !== 403) {
    return undefined;
  }
  const body: unknown = error.error;
  if (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'QUOTA_EXCEEDED'
  ) {
    return body as QuotaExceededDetails;
  }
  return undefined;
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

  /** Whether this server enforces sync capacity at all. */
  readonly enforced = computed(() => this.usage()?.enabled === true);

  /** Over the allowance on a server that enforces it (drives warnings). */
  readonly overQuota = computed(
    () => this.enforced() && this.usage()?.overQuota === true
  );

  /** The user the cached `usage` belongs to. */
  private cachedForUserId: string | undefined;

  /**
   * Bumped by every load and reset, so a response that arrives after a newer
   * load (or after the account changed) is dropped instead of overwriting the
   * newer user's usage.
   */
  private requestSeq = 0;

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

    const requestId = ++this.requestSeq;
    this.isLoading.set(true);
    this.error.set(undefined);
    try {
      const usage = await firstValueFrom(
        this.usersApi
          .getMyStorageUsage()
          .pipe(catchError(this.handleError.bind(this)))
      );
      if (requestId !== this.requestSeq) {
        return undefined;
      }
      this.usage.set(usage);
      return usage;
    } catch (error) {
      // Already logged in handleError; keep the previous value so the meter
      // does not blink to zero on a transient failure.
      if (requestId === this.requestSeq) {
        this.error.set(error as StorageUsageError);
      }
      return undefined;
    } finally {
      if (requestId === this.requestSeq) {
        this.isLoading.set(false);
      }
    }
  }

  /**
   * Load usage only if nothing is cached yet for this user. For surfaces that
   * show the last-known state without forcing a recompute on every visit.
   */
  async ensureLoaded(userId?: string): Promise<void> {
    if (
      this.usage() !== undefined &&
      (userId === undefined || userId === this.cachedForUserId)
    ) {
      return;
    }
    await this.load(userId);
  }

  /**
   * Record a sync-capacity refusal: refresh usage so every meter and warning
   * reflects it. Returns the refusal details, or `undefined` when `error` is
   * not a quota refusal (so callers can fall through to their own handling).
   */
  noteQuotaError(error: unknown): QuotaExceededDetails | undefined {
    const details = getQuotaExceeded(error);
    if (details) {
      void this.load(this.cachedForUserId);
    }
    return details;
  }

  /** Clear cached state (e.g. on sign-out). */
  reset(): void {
    this.requestSeq++;
    this.isLoading.set(false);
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
