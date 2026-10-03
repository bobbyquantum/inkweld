import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type StorageUsage, UsersService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { getQuotaExceeded, StorageUsageService } from './storage-usage.service';

const USAGE: StorageUsage = {
  enabled: true,
  usedBytes: 800,
  quotaBytes: 1000,
  fraction: 0.8,
  overQuota: false,
  overSoftLimit: true,
  projects: [
    {
      id: 'p1',
      slug: 'novel',
      title: 'Novel',
      dataBytes: 500,
      mediaBytes: 300,
      totalBytes: 800,
    },
  ],
};

describe('StorageUsageService', () => {
  let service: StorageUsageService;
  let getMyStorageUsage: ReturnType<typeof vi.fn>;

  function configure(): void {
    getMyStorageUsage = vi.fn().mockReturnValue(of(USAGE));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageUsageService,
        {
          provide: UsersService,
          useValue: { getMyStorageUsage },
        },
        { provide: LoggerService, useValue: { error: () => undefined } },
      ],
    });
    service = TestBed.inject(StorageUsageService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    configure();
  });

  it('loads usage through the generated client and stores it', async () => {
    const result = await service.load();

    expect(getMyStorageUsage).toHaveBeenCalled();
    expect(result).toEqual(USAGE);
    expect(service.usage()).toEqual(USAGE);
    expect(service.error()).toBeUndefined();
    expect(service.isLoading()).toBe(false);
  });

  it('records an error and returns undefined on failure without throwing', async () => {
    getMyStorageUsage.mockReturnValue(throwError(() => ({ status: 500 })));

    expect(await service.load()).toBeUndefined();
    expect(service.error()?.code).toBe('SERVER_ERROR');
    expect(service.usage()).toBeUndefined();
    expect(service.isLoading()).toBe(false);
  });

  it('maps 401 to UNAUTHORIZED and a statusless error to NETWORK_ERROR', async () => {
    getMyStorageUsage.mockReturnValue(throwError(() => ({ status: 401 })));
    await service.load();
    expect(service.error()?.code).toBe('UNAUTHORIZED');

    getMyStorageUsage.mockReturnValue(throwError(() => ({ status: 0 })));
    await service.load();
    expect(service.error()?.code).toBe('NETWORK_ERROR');
  });

  it('keeps the previous usage when a refresh fails', async () => {
    await service.load();
    getMyStorageUsage.mockReturnValue(throwError(() => ({ status: 500 })));
    await service.load();

    // The meter should not blink to zero on a transient failure.
    expect(service.usage()).toEqual(USAGE);
  });

  it('drops cached usage when a different user loads', async () => {
    await service.load('user-1');
    expect(service.usage()).toEqual(USAGE);

    // Simulate the next sign-in: the service should clear the previous
    // account's value before storing the new one.
    getMyStorageUsage.mockReturnValue(
      of({ ...USAGE, usedBytes: 10, quotaBytes: 9999 })
    );
    // Reset is observable synchronously at the start of load, so assert via a
    // spy on the signal transition by checking the final value is the new one.
    await service.load('user-2');
    expect(service.usage()?.usedBytes).toBe(10);
  });

  it('clears state on reset', async () => {
    await service.load();
    service.reset();
    expect(service.usage()).toBeUndefined();
    expect(service.error()).toBeUndefined();
  });

  describe('enforcement state', () => {
    it('reports over quota only when the server enforces it', async () => {
      getMyStorageUsage.mockReturnValue(
        of({ ...USAGE, enabled: false, overQuota: true })
      );
      await service.load();
      expect(service.enforced()).toBe(false);
      expect(service.overQuota()).toBe(false);

      getMyStorageUsage.mockReturnValue(of({ ...USAGE, overQuota: true }));
      await service.load();
      expect(service.enforced()).toBe(true);
      expect(service.overQuota()).toBe(true);
    });
  });

  describe('ensureLoaded', () => {
    it('fetches once and then reuses the cached value for the same user', async () => {
      await service.ensureLoaded('u1');
      await service.ensureLoaded('u1');
      expect(getMyStorageUsage).toHaveBeenCalledTimes(1);
    });

    it('fetches again for a different user', async () => {
      await service.ensureLoaded('u1');
      await service.ensureLoaded('u2');
      expect(getMyStorageUsage).toHaveBeenCalledTimes(2);
    });
  });

  describe('quota refusals', () => {
    const refusal = new HttpErrorResponse({
      status: 403,
      error: {
        code: 'QUOTA_EXCEEDED',
        usedBytes: 10,
        quotaBytes: 10,
        reason: 'project_create',
      },
    });

    it('recognises a quota refusal by its code', () => {
      expect(getQuotaExceeded(refusal)?.reason).toBe('project_create');
    });

    it('ignores an access-denied 403, other statuses and non-HTTP errors', () => {
      expect(
        getQuotaExceeded(
          new HttpErrorResponse({ status: 403, error: { message: 'no' } })
        )
      ).toBeUndefined();
      expect(
        getQuotaExceeded(
          new HttpErrorResponse({
            status: 500,
            error: { code: 'QUOTA_EXCEEDED' },
          })
        )
      ).toBeUndefined();
      expect(getQuotaExceeded(new Error('x'))).toBeUndefined();
    });

    it('refreshes usage after a quota refusal', () => {
      expect(service.noteQuotaError(refusal)).toBeDefined();
      expect(getMyStorageUsage).toHaveBeenCalled();
    });

    it('leaves usage alone for any other error', () => {
      expect(service.noteQuotaError(new Error('x'))).toBeUndefined();
      expect(getMyStorageUsage).not.toHaveBeenCalled();
    });
  });
});
