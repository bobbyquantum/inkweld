import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { User } from '@inkweld/index';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { SetupService } from '../core/setup.service';
import { StorageContextService } from '../core/storage-context.service';
import { LocalUserService } from './local-user.service';

describe('LocalUserService', () => {
  let service: LocalUserService;
  let setupService: MockedObject<SetupService>;
  let storageContextService: MockedObject<StorageContextService>;
  let mockStorage: { [key: string]: string } = {};
  let originalLocalStorage: Storage;

  // The prefixed key that will be used in storage
  const PREFIXED_USER_KEY = 'local:inkweld-local-user';

  const mockUser: User = {
    id: 'local-1',
    username: 'localuser',
    name: 'Local User',
    email: 'local@example.com',
    enabled: true,
  };

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

    setupService = {
      getLocalUserProfile: vi.fn().mockReturnValue(mockUser),
    } as unknown as MockedObject<SetupService>;

    // Mock StorageContextService to return predictable prefixed keys
    storageContextService = {
      prefixKey: vi.fn((key: string) => `local:${key}`),
      prefixDbName: vi.fn((name: string) => `local:${name}`),
      prefixDocumentId: vi.fn((id: string) => `local:${id}`),
      getPrefix: vi.fn().mockReturnValue('local:'),
    } as unknown as MockedObject<StorageContextService>;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LocalUserService,
        { provide: SetupService, useValue: setupService },
        { provide: StorageContextService, useValue: storageContextService },
      ],
    });

    service = TestBed.inject(LocalUserService);
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with anonymous user when no cached data', () => {
      // Service already initialized in beforeEach with empty storage
      expect(service.currentUser().username).toBe('anonymous');
      expect(service.isAuthenticated()).toBe(false);
      expect(service.initialized()).toBe(true);
    });
  });

  describe('initializeFromSetup', () => {
    it('should initialize user from setup service', () => {
      service.initializeFromSetup();

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.initialized()).toBe(true);
      expect(mockStorage[PREFIXED_USER_KEY]).toBe(JSON.stringify(mockUser));
    });

    it('should handle missing user profile from setup', () => {
      setupService.getLocalUserProfile.mockReturnValue(null);
      service.initializeFromSetup();

      expect(service.initialized()).toBe(true);
    });
  });

  describe('setLocalUser', () => {
    it('should set offline user', () => {
      service.setLocalUser(mockUser);

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(mockStorage[PREFIXED_USER_KEY]).toBe(JSON.stringify(mockUser));
    });
  });

  describe('updateLocalUser', () => {
    it('should update offline user with partial data', () => {
      service.setLocalUser(mockUser);
      const updates = { name: 'Updated Name' };

      service.updateLocalUser(updates);

      expect(service.currentUser()).toEqual({ ...mockUser, ...updates });
      expect(mockStorage[PREFIXED_USER_KEY]).toBe(
        JSON.stringify({ ...mockUser, ...updates })
      );
    });
  });

  describe('clearLocalUser', () => {
    it('should clear offline user', () => {
      service.setLocalUser(mockUser);
      service.clearLocalUser();

      expect(service.currentUser().username).toBe('anonymous');
      expect(service.isAuthenticated()).toBe(false);
      expect(mockStorage[PREFIXED_USER_KEY]).toBeUndefined();
    });
  });

  describe('hasCachedUser', () => {
    it('should return true when user is cached', () => {
      mockStorage[PREFIXED_USER_KEY] = JSON.stringify(mockUser);
      // Need to reload the service to pick up the cached data
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          LocalUserService,
          { provide: SetupService, useValue: setupService },
          { provide: StorageContextService, useValue: storageContextService },
        ],
      });
      const newService = TestBed.inject(LocalUserService);
      expect(newService.hasCachedUser()).toBe(true);
    });

    it('should return false when no user is cached', () => {
      expect(service.hasCachedUser()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle localStorage errors when saving', () => {
      // Override the mock to throw an error
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          ...globalThis.localStorage,
          setItem: () => {
            throw new Error('Storage full');
          },
        } as Storage,
        writable: true,
        configurable: true,
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      service.setLocalUser(mockUser);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle localStorage errors when loading invalid JSON', () => {
      // Store invalid JSON in localStorage using the prefixed key
      mockStorage[PREFIXED_USER_KEY] = 'invalid json {{{';

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Create a new service instance to trigger loadLocalUser
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          LocalUserService,
          { provide: SetupService, useValue: setupService },
          { provide: StorageContextService, useValue: storageContextService },
        ],
      });

      const newService = TestBed.inject(LocalUserService);

      // Verify that error was logged and service is still functional
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load local user:',
        expect.any(Error)
      );
      expect(newService.initialized()).toBe(true);
      expect(newService.currentUser().username).toBe('anonymous');

      consoleSpy.mockRestore();
    });
  });
});
