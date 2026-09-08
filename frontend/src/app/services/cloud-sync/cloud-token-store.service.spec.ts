import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type CloudTokenSet,
  CloudTokenStoreService,
} from './cloud-token-store.service';

describe('CloudTokenStoreService', () => {
  let service: CloudTokenStoreService;
  let store: Record<string, string>;
  const originalLocalStorage = window.localStorage;

  const tokens: CloudTokenSet = {
    provider: 'dropbox',
    accountId: 'dbid:1',
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 60 * 60 * 1000,
  };

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
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), CloudTokenStoreService],
    });
    service = TestBed.inject(CloudTokenStoreService);
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('stores and retrieves tokens per config id', () => {
    service.set('cloud-dropbox-abc', tokens);
    expect(service.get('cloud-dropbox-abc')).toEqual(tokens);
    expect(service.has('cloud-dropbox-abc')).toBe(true);
    expect(service.get('cloud-dropbox-other')).toBeNull();
    expect(Object.keys(store)[0]).toBe('inkweld-cloud-token:cloud-dropbox-abc');
  });

  it('clears tokens', () => {
    service.set('id', tokens);
    service.clear('id');
    expect(service.has('id')).toBe(false);
  });

  it('rejects malformed stored values', () => {
    store['inkweld-cloud-token:bad'] = JSON.stringify({ accessToken: 1 });
    store['inkweld-cloud-token:worse'] = '{';
    expect(service.get('bad')).toBeNull();
    expect(service.get('worse')).toBeNull();
  });

  it('treats tokens as expired inside the skew window', () => {
    expect(service.isExpired(tokens)).toBe(false);
    expect(
      service.isExpired({ ...tokens, expiresAt: Date.now() + 30_000 })
    ).toBe(true);
    expect(service.isExpired({ ...tokens, expiresAt: Date.now() - 1 })).toBe(
      true
    );
    expect(
      service.isExpired({ ...tokens, expiresAt: Date.now() + 30_000 }, 0)
    ).toBe(false);
  });
});
