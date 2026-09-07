import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  CLOUD_SYNC_APP_KEYS_STORAGE_KEY,
  CloudSyncConfigService,
} from './cloud-sync-config.service';

describe('CloudSyncConfigService', () => {
  let store: Record<string, string>;
  const originalLocalStorage = window.localStorage;
  const originalCloudSync = environment.cloudSync;

  function createService(): CloudSyncConfigService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), CloudSyncConfigService],
    });
    return TestBed.inject(CloudSyncConfigService);
  }

  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((k: string) => store[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store[k] = v;
        }),
        removeItem: vi.fn((k: string) => {
          delete store[k];
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    (environment as { cloudSync: typeof originalCloudSync }).cloudSync =
      originalCloudSync;
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('offers dropbox when the build has an app key', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: 'buildkey' },
    };
    const service = createService();
    expect(service.isCloudSyncAvailable()).toBe(true);
    expect(service.availableProviders()).toEqual(['dropbox']);
    expect(service.getAppKey('dropbox')).toBe('buildkey');
    expect(service.isProviderAvailable('dropbox')).toBe(true);
  });

  it('hides cloud sync when no provider has a key', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: '' },
    };
    const service = createService();
    expect(service.isCloudSyncAvailable()).toBe(false);
    expect(service.availableProviders()).toEqual([]);
    expect(service.getAppKey('dropbox')).toBe('');
  });

  it('never offers providers without an adapter, even with a key', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: '' },
      'google-drive': { appKey: 'gkey' },
    };
    const service = createService();
    expect(service.availableProviders()).toEqual([]);
  });

  it('prefers a runtime override over the build key and persists it', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: 'buildkey' },
    };
    const service = createService();
    service.setAppKeyOverride('dropbox', '  mykey  ');
    expect(service.getAppKey('dropbox')).toBe('mykey');
    expect(service.getAppKeyOverride('dropbox')).toBe('mykey');
    expect(service.getBuildAppKey('dropbox')).toBe('buildkey');
    expect(JSON.parse(store[CLOUD_SYNC_APP_KEYS_STORAGE_KEY])).toEqual({
      dropbox: 'mykey',
    });
  });

  it('loads overrides from localStorage on construction', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: '' },
    };
    store[CLOUD_SYNC_APP_KEYS_STORAGE_KEY] = JSON.stringify({
      dropbox: 'selfhosted',
      bogus: 42,
    });
    const service = createService();
    expect(service.getAppKey('dropbox')).toBe('selfhosted');
    expect(service.isCloudSyncAvailable()).toBe(true);
  });

  it('clearing the override falls back to the build key and removes storage', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: 'buildkey' },
    };
    const service = createService();
    service.setAppKeyOverride('dropbox', 'mykey');
    service.setAppKeyOverride('dropbox', '');
    expect(service.getAppKey('dropbox')).toBe('buildkey');
    expect(store[CLOUD_SYNC_APP_KEYS_STORAGE_KEY]).toBeUndefined();
  });

  it('ignores corrupt override storage', () => {
    (environment as { cloudSync: unknown }).cloudSync = {
      dropbox: { appKey: 'buildkey' },
    };
    store[CLOUD_SYNC_APP_KEYS_STORAGE_KEY] = '{oops';
    const service = createService();
    expect(service.getAppKey('dropbox')).toBe('buildkey');
  });
});
