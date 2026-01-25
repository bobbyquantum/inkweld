import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_CONFIG_STORAGE_KEY,
  AppConfigV2,
  StorageContextService,
} from '../core/storage-context.service';
import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let mockStorage: { [key: string]: string } = {};
  let originalLocalStorage: Storage;

  // Helper to set up storage context with a specific mode BEFORE creating services
  function setupMockStorage(mode: 'local' | 'server', serverUrl?: string) {
    // Use a simple hash calculation for test purposes
    const hash = serverUrl ? hashUrl(serverUrl) : '';

    if (mode === 'local') {
      const config: AppConfigV2 = {
        version: 2,
        activeConfigId: 'local',
        configurations: [
          {
            id: 'local',
            type: 'local',
            displayName: 'Local Mode',
            addedAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
          },
        ],
      };
      mockStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(config);
    } else {
      const config: AppConfigV2 = {
        version: 2,
        activeConfigId: hash,
        configurations: [
          {
            id: hash,
            type: 'server',
            serverUrl,
            displayName: 'Test Server',
            addedAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
          },
        ],
      };
      mockStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(config);
    }
  }

  // Simple djb2 hash matching StorageContextService implementation
  function hashUrl(url: string): string {
    const normalized = url.toLowerCase().replace(/\/+$/, '');
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash << 5) + hash + normalized.charCodeAt(i);
      hash = hash & hash;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return hex.substring(0, 8);
  }

  // Helper to create TestBed and inject services (call after setupMockStorage)
  function createServices() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageContextService,
        AuthTokenService,
      ],
    });
    TestBed.inject(StorageContextService); // Initialize but don't store (uses prefixed keys)
    service = TestBed.inject(AuthTokenService);
  }

  beforeEach(() => {
    // Create a fresh mock storage for each test
    mockStorage = {};
    originalLocalStorage = globalThis.localStorage;

    // Mock the global localStorage object
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => mockStorage[key] || null,
        setItem: (key: string, value: string) => {
          mockStorage[key] = value;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
        clear: () => {
          mockStorage = {};
        },
        length: 0,
        key: (_index: number) => null,
      } as Storage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    setupMockStorage('local');
    createServices();
    expect(service).toBeTruthy();
  });

  describe('local mode', () => {
    beforeEach(() => {
      setupMockStorage('local');
      createServices();
    });

    it('should store token with local prefix', () => {
      const token = 'test-token-123';
      service.setToken(token);

      expect(mockStorage['local:auth_token']).toBe(token);
    });

    it('should retrieve token with local prefix', () => {
      const token = 'test-token-123';
      mockStorage['local:auth_token'] = token;

      const result = service.getToken();

      expect(result).toBe(token);
    });

    it('should return null if no token exists', () => {
      const result = service.getToken();

      expect(result).toBeNull();
    });

    it('should clear token with local prefix', () => {
      mockStorage['local:auth_token'] = 'test-token';
      service.clearToken();

      expect(mockStorage['local:auth_token']).toBeUndefined();
    });

    it('should check hasToken correctly', () => {
      expect(service.hasToken()).toBe(false);
      mockStorage['local:auth_token'] = 'test-token';
      expect(service.hasToken()).toBe(true);
    });
  });

  describe('server mode', () => {
    const serverUrl = 'https://inkweld.example.com';
    let serverHash: string;

    beforeEach(() => {
      serverHash = hashUrl(serverUrl);
      setupMockStorage('server', serverUrl);
      createServices();
    });

    it('should store token with server prefix', () => {
      const token = 'server-token-123';
      service.setToken(token);

      expect(mockStorage[`srv:${serverHash}:auth_token`]).toBe(token);
    });

    it('should retrieve token with server prefix', () => {
      const token = 'server-token-123';
      mockStorage[`srv:${serverHash}:auth_token`] = token;

      const result = service.getToken();

      expect(result).toBe(token);
    });

    it('should clear token with server prefix', () => {
      mockStorage[`srv:${serverHash}:auth_token`] = 'test-token';
      service.clearToken();

      expect(mockStorage[`srv:${serverHash}:auth_token`]).toBeUndefined();
    });
  });

  describe('multi-server support', () => {
    const server1 = 'https://server1.example.com';
    const server2 = 'https://server2.example.com';
    let hash1: string;
    let hash2: string;

    beforeEach(() => {
      hash1 = hashUrl(server1);
      hash2 = hashUrl(server2);
      setupMockStorage('server', server1);
      createServices();
    });

    it('should get token for specific config', () => {
      mockStorage[`srv:${hash1}:auth_token`] = 'token1';
      mockStorage[`srv:${hash2}:auth_token`] = 'token2';
      mockStorage['local:auth_token'] = 'local-token';

      expect(service.getTokenForConfig(hash1)).toBe('token1');
      expect(service.getTokenForConfig(hash2)).toBe('token2');
      expect(service.getTokenForConfig('local')).toBe('local-token');
    });

    it('should check hasTokenForConfig correctly', () => {
      mockStorage[`srv:${hash1}:auth_token`] = 'token1';

      expect(service.hasTokenForConfig(hash1)).toBe(true);
      expect(service.hasTokenForConfig(hash2)).toBe(false);
      expect(service.hasTokenForConfig('local')).toBe(false);
    });

    it('should clear token for specific config', () => {
      mockStorage[`srv:${hash1}:auth_token`] = 'token1';
      mockStorage[`srv:${hash2}:auth_token`] = 'token2';

      service.clearTokenForConfig(hash1);

      expect(mockStorage[`srv:${hash1}:auth_token`]).toBeUndefined();
      expect(mockStorage[`srv:${hash2}:auth_token`]).toBe('token2');
    });
  });

  describe('integration', () => {
    beforeEach(() => {
      setupMockStorage('local');
      createServices();
    });

    it('should handle full token lifecycle in local mode', () => {
      const token = 'lifecycle-token';

      // Set token
      service.setToken(token);
      expect(mockStorage['local:auth_token']).toBe(token);

      // Get token
      expect(service.getToken()).toBe(token);
      expect(service.hasToken()).toBe(true);

      // Clear token
      service.clearToken();
      expect(mockStorage['local:auth_token']).toBeUndefined();

      // Verify cleared
      expect(service.getToken()).toBeNull();
      expect(service.hasToken()).toBe(false);
    });
  });
});
