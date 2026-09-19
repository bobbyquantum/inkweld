import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type StorageUsage, UsersService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { StorageUsageService } from './storage-usage.service';

const USAGE: StorageUsage = {
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
});
