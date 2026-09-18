import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import {
  type StorageUsage,
  StorageUsageService,
} from './storage-usage.service';

const SERVER = 'https://inkweld.example.com';
const URL = `${SERVER}/api/v1/users/me/storage`;

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
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        StorageUsageService,
        { provide: SetupService, useValue: { getServerUrl: () => SERVER } },
        { provide: LoggerService, useValue: { error: () => undefined } },
      ],
    });

    service = TestBed.inject(StorageUsageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('loads usage with credentials and stores it', async () => {
    const promise = service.load();

    const request = http.expectOne({ method: 'GET', url: URL });
    expect(request.request.withCredentials).toBe(true);
    request.flush(USAGE);

    const result = await promise;
    expect(result).toEqual(USAGE);
    expect(service.usage()).toEqual(USAGE);
    expect(service.error()).toBeUndefined();
    expect(service.isLoading()).toBe(false);
  });

  it('falls back to a relative path when no server URL is configured', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        StorageUsageService,
        { provide: SetupService, useValue: { getServerUrl: () => null } },
        { provide: LoggerService, useValue: { error: () => undefined } },
      ],
    });
    service = TestBed.inject(StorageUsageService);
    http = TestBed.inject(HttpTestingController);

    const promise = service.load();
    const request = http.expectOne({
      method: 'GET',
      url: '/api/v1/users/me/storage',
    });
    request.flush(USAGE);
    await promise;
  });

  it('records an error and returns undefined on failure without throwing', async () => {
    const promise = service.load();

    const request = http.expectOne({ method: 'GET', url: URL });
    request.flush(
      { error: 'boom' },
      { status: 500, statusText: 'Server Error' }
    );

    expect(await promise).toBeUndefined();
    expect(service.error()?.code).toBe('SERVER_ERROR');
    expect(service.usage()).toBeUndefined();
    expect(service.isLoading()).toBe(false);
  });

  it('maps 401 to UNAUTHORIZED and 0 to NETWORK_ERROR', async () => {
    const first = service.load();
    http.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });
    await first;
    expect(service.error()?.code).toBe('UNAUTHORIZED');

    const second = service.load();
    http.expectOne(URL).error(new ProgressEvent('error'));
    await second;
    expect(service.error()?.code).toBe('NETWORK_ERROR');
  });

  it('keeps the previous usage when a refresh fails', async () => {
    const first = service.load();
    http.expectOne(URL).flush(USAGE);
    await first;

    const second = service.load();
    http.expectOne(URL).flush({}, { status: 500, statusText: 'Server Error' });
    await second;

    // The meter should not blink to zero on a transient failure.
    expect(service.usage()).toEqual(USAGE);
  });

  it('clears state on reset', async () => {
    const promise = service.load();
    http.expectOne(URL).flush(USAGE);
    await promise;

    service.reset();
    expect(service.usage()).toBeUndefined();
    expect(service.error()).toBeUndefined();
  });
});
