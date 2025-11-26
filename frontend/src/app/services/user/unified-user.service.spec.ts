import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { User } from '@inkweld/index';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { SetupService } from '../core/setup.service';
import { OfflineUserService } from '../offline/offline-user.service';
import { UnifiedUserService } from './unified-user.service';
import { UserService } from './user.service';

describe('UnifiedUserService', () => {
  let service: UnifiedUserService;
  let setupService: MockedObject<SetupService>;
  let userService: MockedObject<UserService>;
  let offlineUserService: MockedObject<OfflineUserService>;
  let router: MockedObject<Router>;

  const mockServerUser: User = {
    id: '1',
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    enabled: true,
  };

  const mockOfflineUser: User = {
    id: 'offline-1',
    username: 'offlineuser',
    name: 'Offline User',
    email: 'offline@example.com',
    enabled: true,
  };

  beforeEach(() => {
    const currentUserSignal = signal(mockServerUser);
    const isLoadingSignal = signal(false);
    const isAuthenticatedSignal = signal(true);
    const initializedSignal = signal(true);
    const errorSignal = signal(null);

    const offlineCurrentUserSignal = signal(mockOfflineUser);
    const offlineIsLoadingSignal = signal(false);
    const offlineIsAuthenticatedSignal = signal(true);
    const offlineInitializedSignal = signal(true);

    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as MockedObject<SetupService>;

    userService = {
      currentUser: currentUserSignal,
      isLoading: isLoadingSignal,
      isAuthenticated: isAuthenticatedSignal,
      initialized: initializedSignal,
      error: errorSignal,
      loadCurrentUser: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      setCurrentUser: vi.fn().mockResolvedValue(undefined),
      hasCachedUser: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<UserService>;

    offlineUserService = {
      currentUser: offlineCurrentUserSignal,
      isLoading: offlineIsLoadingSignal,
      isAuthenticated: offlineIsAuthenticatedSignal,
      initialized: offlineInitializedSignal,
      initializeFromSetup: vi.fn(),
      clearOfflineUser: vi.fn(),
      updateOfflineUser: vi.fn(),
      hasCachedUser: vi.fn().mockReturnValue(true),
    } as unknown as MockedObject<OfflineUserService>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        UnifiedUserService,
        { provide: SetupService, useValue: setupService },
        { provide: UserService, useValue: userService },
        { provide: OfflineUserService, useValue: offlineUserService },
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(UnifiedUserService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('server mode', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue('server');
    });

    it('should return server currentUser', () => {
      const user = service.currentUser();
      expect(user).toEqual(mockServerUser);
    });

    it('should return server isLoading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should return server isAuthenticated', () => {
      expect(service.isAuthenticated()).toBe(true);
    });

    it('should return server initialized', () => {
      expect(service.initialized()).toBe(true);
    });

    it('should return server error', () => {
      expect(service.error()).toBeNull();
    });

    it('should initialize from server', async () => {
      await service.initialize();
      expect(userService.loadCurrentUser).toHaveBeenCalled();
    });

    it('should handle initialization error gracefully', async () => {
      userService.loadCurrentUser.mockRejectedValue(new Error('Network error'));
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should login via server', async () => {
      await service.login('testuser', 'password');
      expect(userService.login).toHaveBeenCalledWith('testuser', 'password');
    });

    it('should logout via server', async () => {
      await service.logout();
      expect(userService.logout).toHaveBeenCalled();
    });

    it('should update user via server', async () => {
      const updates = { name: 'Updated Name' };
      await service.updateUser(updates);
      expect(userService.setCurrentUser).toHaveBeenCalledWith({
        ...mockServerUser,
        ...updates,
      });
    });

    it('should check cached user via server', async () => {
      const hasCached = await service.hasCachedUser();
      expect(hasCached).toBe(true);
      expect(userService.hasCachedUser).toHaveBeenCalled();
    });
  });

  describe('offline mode', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue('offline');
    });

    it('should return offline currentUser', () => {
      const user = service.currentUser();
      expect(user).toEqual(mockOfflineUser);
    });

    it('should return offline isLoading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should return offline isAuthenticated', () => {
      expect(service.isAuthenticated()).toBe(true);
    });

    it('should return offline initialized', () => {
      expect(service.initialized()).toBe(true);
    });

    it('should return undefined error in offline mode', () => {
      expect(service.error()).toBeUndefined();
    });

    it('should initialize from offline service', async () => {
      await service.initialize();
      expect(offlineUserService.initializeFromSetup).toHaveBeenCalled();
    });

    it('should throw error when trying to login in offline mode', async () => {
      await expect(service.login('user', 'pass')).rejects.toThrow(
        'Login not available in offline mode'
      );
    });

    it('should logout and navigate to setup in offline mode', async () => {
      await service.logout();
      expect(offlineUserService.clearOfflineUser).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('should update user via offline service', async () => {
      const updates = { name: 'Updated Offline Name' };
      await service.updateUser(updates);
      expect(offlineUserService.updateOfflineUser).toHaveBeenCalledWith(
        updates
      );
    });

    it('should check cached user via offline service', async () => {
      const hasCached = await service.hasCachedUser();
      expect(hasCached).toBe(true);
      expect(offlineUserService.hasCachedUser).toHaveBeenCalled();
    });
  });

  describe('getMode', () => {
    it('should return current mode', () => {
      setupService.getMode.mockReturnValue('server');
      expect(service.getMode()).toBe('server');

      setupService.getMode.mockReturnValue('offline');
      expect(service.getMode()).toBe('offline');
    });
  });

  describe('null mode', () => {
    beforeEach(() => {
      setupService.getMode.mockReturnValue(null);
    });

    it('should return false for hasCachedUser when mode is null', async () => {
      const hasCached = await service.hasCachedUser();
      expect(hasCached).toBe(false);
    });
  });
});
