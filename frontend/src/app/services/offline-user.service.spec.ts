import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { User } from '../../api-client/model/user';
import { OfflineUserService } from './offline-user.service';
import { SetupService } from './setup.service';

describe('OfflineUserService', () => {
  let service: OfflineUserService;
  let setupService: MockedObject<SetupService>;
  let mockStorage: { [key: string]: string } = {};
  let originalLocalStorage: Storage;

  const mockUser: User = {
    id: 'offline-1',
    username: 'offlineuser',
    name: 'Offline User',
    email: 'offline@example.com',
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
      getOfflineUserProfile: vi.fn().mockReturnValue(mockUser),
    } as unknown as MockedObject<SetupService>;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        OfflineUserService,
        { provide: SetupService, useValue: setupService },
      ],
    });

    service = TestBed.inject(OfflineUserService);
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
      expect(mockStorage['inkweld-offline-user']).toBe(
        JSON.stringify(mockUser)
      );
    });

    it('should handle missing user profile from setup', () => {
      setupService.getOfflineUserProfile.mockReturnValue(null);
      service.initializeFromSetup();

      expect(service.initialized()).toBe(true);
    });
  });

  describe('setOfflineUser', () => {
    it('should set offline user', () => {
      service.setOfflineUser(mockUser);

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
      expect(mockStorage['inkweld-offline-user']).toBe(
        JSON.stringify(mockUser)
      );
    });
  });

  describe('updateOfflineUser', () => {
    it('should update offline user with partial data', () => {
      service.setOfflineUser(mockUser);
      const updates = { name: 'Updated Name' };

      service.updateOfflineUser(updates);

      expect(service.currentUser()).toEqual({ ...mockUser, ...updates });
      expect(mockStorage['inkweld-offline-user']).toBe(
        JSON.stringify({ ...mockUser, ...updates })
      );
    });
  });

  describe('clearOfflineUser', () => {
    it('should clear offline user', () => {
      service.setOfflineUser(mockUser);
      service.clearOfflineUser();

      expect(service.currentUser().username).toBe('anonymous');
      expect(service.isAuthenticated()).toBe(false);
      expect(mockStorage['inkweld-offline-user']).toBeUndefined();
    });
  });

  describe('hasCachedUser', () => {
    it('should return true when user is cached', () => {
      mockStorage['inkweld-offline-user'] = JSON.stringify(mockUser);
      expect(service.hasCachedUser()).toBe(true);
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

      service.setOfflineUser(mockUser);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
