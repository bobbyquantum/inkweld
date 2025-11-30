import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthTokenService } from './auth-token.service';

describe('AuthTokenService', () => {
  let service: AuthTokenService;
  let mockStorage: { [key: string]: string } = {};
  let originalLocalStorage: Storage;

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

    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), AuthTokenService],
    });

    service = TestBed.inject(AuthTokenService);
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
    expect(service).toBeTruthy();
  });

  describe('setToken', () => {
    it('should store token in localStorage', () => {
      const token = 'test-token-123';
      service.setToken(token);

      expect(mockStorage['auth_token']).toBe(token);
    });
  });

  describe('getToken', () => {
    it('should retrieve token from localStorage', () => {
      const token = 'test-token-123';
      mockStorage['auth_token'] = token;

      const result = service.getToken();

      expect(result).toBe(token);
    });

    it('should return null if no token exists', () => {
      const result = service.getToken();

      expect(result).toBeNull();
    });
  });

  describe('clearToken', () => {
    it('should remove token from localStorage', () => {
      mockStorage['auth_token'] = 'test-token';
      service.clearToken();

      expect(mockStorage['auth_token']).toBeUndefined();
    });
  });

  describe('hasToken', () => {
    it('should return true if token exists', () => {
      mockStorage['auth_token'] = 'test-token';

      expect(service.hasToken()).toBe(true);
    });

    it('should return false if token does not exist', () => {
      expect(service.hasToken()).toBe(false);
    });
  });

  describe('integration', () => {
    it('should handle full token lifecycle', () => {
      const token = 'lifecycle-token';

      // Set token
      service.setToken(token);
      expect(mockStorage['auth_token']).toBe(token);

      // Get token
      expect(service.getToken()).toBe(token);
      expect(service.hasToken()).toBe(true);

      // Clear token
      service.clearToken();
      expect(mockStorage['auth_token']).toBeUndefined();

      // Verify cleared
      expect(service.getToken()).toBeNull();
      expect(service.hasToken()).toBe(false);
    });
  });
});
