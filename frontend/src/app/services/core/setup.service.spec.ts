import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { SetupService } from './setup.service';
import {
  APP_CONFIG_STORAGE_KEY,
  LOCAL_CONFIG_ID,
  StorageContextService,
} from './storage-context.service';

describe('SetupService', () => {
  let service: SetupService;
  let mockLocalStorage: { [key: string]: string };

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {};
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
      key: vi.fn(
        (index: number) => Object.keys(mockLocalStorage)[index] || null
      ),
      get length() {
        return Object.keys(mockLocalStorage).length;
      },
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock fetch for server health checks
    globalThis.fetch = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        StorageContextService,
        SetupService,
      ],
    });
    service = TestBed.inject(SetupService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with no configuration', () => {
    expect(service.isConfigured()).toBe(false);
    expect(service.appConfig()).toBe(null);
    expect(service.isLoading()).toBe(false);
  });

  describe('loadConfig on initialization', () => {
    it('should load stored v2 config when present at startup', () => {
      // Pre-populate storage with v2 config before creating a fresh TestBed
      const v2Config = {
        version: 2,
        activeConfigId: LOCAL_CONFIG_ID,
        configurations: [
          {
            id: LOCAL_CONFIG_ID,
            type: 'local',
            displayName: 'Local Mode',
            userProfile: { name: 'Preloaded', username: 'preloaded' },
            addedAt: '2025-01-01T00:00:00Z',
            lastUsedAt: '2025-01-01T00:00:00Z',
          },
        ],
      };
      mockLocalStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(v2Config);

      // Reset TestBed to create a fresh service with pre-populated storage
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          StorageContextService,
          SetupService,
        ],
      });

      const freshService = TestBed.inject(SetupService);

      // The constructor should have loaded the config
      expect(freshService.isConfigured()).toBe(true);
      expect(freshService.appConfig()).toEqual({
        mode: 'local',
        serverUrl: undefined,
        userProfile: { name: 'Preloaded', username: 'preloaded' },
      });
    });

    it('should migrate legacy v1 config to v2 on load', () => {
      // Pre-populate storage with legacy v1 config
      const legacyConfig = {
        mode: 'local',
        userProfile: { name: 'Legacy User', username: 'legacyuser' },
      };
      mockLocalStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(legacyConfig);

      // Reset TestBed to create a fresh service
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          StorageContextService,
          SetupService,
        ],
      });

      const freshService = TestBed.inject(SetupService);

      // Should have migrated and loaded
      expect(freshService.isConfigured()).toBe(true);
      expect(freshService.appConfig()?.mode).toBe('local');
      expect(freshService.appConfig()?.userProfile?.username).toBe(
        'legacyuser'
      );

      // Verify v2 format was saved
      const stored = JSON.parse(mockLocalStorage[APP_CONFIG_STORAGE_KEY]);
      expect(stored.version).toBe(2);
    });
  });

  describe('migrateStorageKeys', () => {
    it('should migrate legacy offline user key to local user key', () => {
      // Pre-populate storage with legacy key
      const legacyUser = JSON.stringify({ name: 'Legacy', username: 'legacy' });
      mockLocalStorage['inkweld-offline-user'] = legacyUser;

      // Reset TestBed to create a fresh service (migration runs in constructor)
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          StorageContextService,
          SetupService,
        ],
      });
      TestBed.inject(SetupService);

      // Verify migration happened
      expect(mockLocalStorage['inkweld-local-user']).toBe(legacyUser);
      expect(mockLocalStorage['inkweld-offline-user']).toBeUndefined();
    });

    it('should migrate legacy offline projects key to local projects key', () => {
      // Pre-populate storage with legacy key
      const legacyProjects = JSON.stringify([{ slug: 'test-project' }]);
      mockLocalStorage['inkweld-offline-projects'] = legacyProjects;

      // Reset TestBed to create a fresh service
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          StorageContextService,
          SetupService,
        ],
      });
      TestBed.inject(SetupService);

      // Verify migration happened
      expect(mockLocalStorage['inkweld-local-projects']).toBe(legacyProjects);
      expect(mockLocalStorage['inkweld-offline-projects']).toBeUndefined();
    });

    it('should not overwrite existing local keys during migration', () => {
      // Pre-populate storage with both legacy and new keys
      const legacyUser = JSON.stringify({ name: 'Legacy', username: 'legacy' });
      const newUser = JSON.stringify({ name: 'New', username: 'new' });
      mockLocalStorage['inkweld-offline-user'] = legacyUser;
      mockLocalStorage['inkweld-local-user'] = newUser;

      // Reset TestBed to create a fresh service
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          StorageContextService,
          SetupService,
        ],
      });
      TestBed.inject(SetupService);

      // Verify new key was NOT overwritten
      expect(mockLocalStorage['inkweld-local-user']).toBe(newUser);
      // Legacy key should still exist (not removed because new key existed)
      expect(mockLocalStorage['inkweld-offline-user']).toBe(legacyUser);
    });
  });

  describe('checkConfiguration', () => {
    it('should return false when no config is stored', () => {
      const result = service.checkConfiguration();
      expect(result).toBe(false);
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true when valid config is stored', () => {
      service.configureLocalMode({ name: 'Test', username: 'test' });

      const result = service.checkConfiguration();
      expect(result).toBe(true);
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('configureServerMode', () => {
    it('should configure server mode successfully', async () => {
      const serverUrl = 'https://api.example.com';
      (globalThis.fetch as Mock).mockResolvedValue({
        ok: true,
      });

      await service.configureServerMode(serverUrl);

      expect(service.isConfigured()).toBe(true);
      expect(service.appConfig()?.mode).toBe('server');
      expect(service.appConfig()?.serverUrl).toBe(serverUrl);
      expect(service.isLoading()).toBe(false);
      expect(mockLocalStorage[APP_CONFIG_STORAGE_KEY]).toBeDefined();
    });

    it('should handle server connection failure', async () => {
      const serverUrl = 'https://unreachable.example.com';
      (globalThis.fetch as Mock).mockResolvedValue({
        ok: false,
      });
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(service.configureServerMode(serverUrl)).rejects.toThrow(
        'Server is not reachable'
      );
      expect(service.isLoading()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to configure server mode:',
        expect.any(Error)
      );
    });

    it('should handle fetch errors', async () => {
      const serverUrl = 'https://error.example.com';
      (globalThis.fetch as Mock).mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(service.configureServerMode(serverUrl)).rejects.toThrow(
        'Network error'
      );
      expect(service.isLoading()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to configure server mode:',
        expect.any(Error)
      );
    });

    it('should set loading state correctly during operation', async () => {
      const serverUrl = 'https://api.example.com';
      (globalThis.fetch as Mock).mockImplementation(() => {
        expect(service.isLoading()).toBe(true);
        return Promise.resolve({ ok: true });
      });

      await service.configureServerMode(serverUrl);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('configureLocalMode', () => {
    it('should configure local mode successfully', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };

      service.configureLocalMode(userProfile);

      expect(service.isConfigured()).toBe(true);
      expect(service.appConfig()?.mode).toBe('local');
      expect(service.appConfig()?.userProfile).toEqual(userProfile);
      expect(service.isLoading()).toBe(false);
      expect(mockLocalStorage[APP_CONFIG_STORAGE_KEY]).toBeDefined();
    });
  });

  describe('resetConfiguration', () => {
    it('should reset configuration completely', () => {
      // First set up a configuration
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureLocalMode(userProfile);
      expect(service.isConfigured()).toBe(true);

      // Reset it
      service.resetConfiguration();

      expect(service.isConfigured()).toBe(false);
      expect(service.appConfig()).toBe(null);
    });
  });

  describe('getMode', () => {
    it('should return null when no config is set', () => {
      expect(service.getMode()).toBe(null);
    });

    it('should return server mode when configured', async () => {
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode('https://api.example.com');

      expect(service.getMode()).toBe('server');
    });

    it('should return local mode when configured', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureLocalMode(userProfile);

      expect(service.getMode()).toBe('local');
    });
  });

  describe('getServerUrl', () => {
    it('should return null when no config is set', () => {
      expect(service.getServerUrl()).toBe(null);
    });

    it('should return null when in local mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureLocalMode(userProfile);

      expect(service.getServerUrl()).toBe(null);
    });

    it('should return server URL when in server mode', async () => {
      const serverUrl = 'https://api.example.com';
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode(serverUrl);

      expect(service.getServerUrl()).toBe(serverUrl);
    });
  });

  describe('getWebSocketUrl', () => {
    it('should return null when no config is set', () => {
      expect(service.getWebSocketUrl()).toBe(null);
    });

    it('should return null in local mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureLocalMode(userProfile);

      expect(service.getWebSocketUrl()).toBe(null);
    });

    it('should convert HTTP server URL to WebSocket URL', async () => {
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode('http://localhost:8333');

      expect(service.getWebSocketUrl()).toBe('ws://localhost:8333');
    });

    it('should convert HTTPS server URL to secure WebSocket URL', async () => {
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode('https://api.example.com');

      expect(service.getWebSocketUrl()).toBe('wss://api.example.com');
    });

    it('should handle server URL with port', async () => {
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode('https://api.example.com:8080');

      expect(service.getWebSocketUrl()).toBe('wss://api.example.com:8080');
    });
  });

  describe('getLocalUserProfile', () => {
    it('should return null when no config is set', () => {
      expect(service.getLocalUserProfile()).toBe(null);
    });

    it('should return null when in server mode', async () => {
      const serverUrl = 'https://api.example.com';
      (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
      await service.configureServerMode(serverUrl);

      expect(service.getLocalUserProfile()).toBe(null);
    });

    it('should return user profile when in local mode', () => {
      const userProfile = { name: 'Test User', username: 'testuser' };
      service.configureLocalMode(userProfile);

      const result = service.getLocalUserProfile();
      expect(result?.name).toBe('Test User');
      expect(result?.username).toBe('testuser');
      expect(result?.enabled).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-SERVER MANAGEMENT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('multi-server management', () => {
    describe('getConfigurations', () => {
      it('should return empty array when no configs', () => {
        expect(service.getConfigurations()).toEqual([]);
      });

      it('should return all configurations', async () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        await service.addServerConfig('https://server1.com');
        await service.addServerConfig('https://server2.com');

        const configs = service.getConfigurations();
        expect(configs).toHaveLength(3);
      });
    });

    describe('getActiveConfig', () => {
      it('should return null when no config', () => {
        expect(service.getActiveConfig()).toBeNull();
      });

      it('should return active config', () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        const active = service.getActiveConfig();
        expect(active?.id).toBe(LOCAL_CONFIG_ID);
        expect(active?.type).toBe('local');
      });
    });

    describe('addServerConfig', () => {
      it('should add a new server without switching to it', async () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });

        const newConfig = await service.addServerConfig(
          'https://server.com',
          'My Server'
        );

        expect(newConfig.serverUrl).toBe('https://server.com');
        expect(newConfig.displayName).toBe('My Server');
        // Should still be in local mode
        expect(service.getActiveConfig()?.type).toBe('local');
      });

      it('should validate server before adding', async () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        (globalThis.fetch as Mock).mockResolvedValue({ ok: false });

        await expect(
          service.addServerConfig('https://bad-server.com')
        ).rejects.toThrow('Server is not reachable');
      });
    });

    describe('hasServerConfig', () => {
      it('should return true if server is configured', async () => {
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        await service.configureServerMode('https://example.com');

        expect(service.hasServerConfig('https://example.com')).toBe(true);
        expect(service.hasServerConfig('https://EXAMPLE.COM')).toBe(true);
      });

      it('should return false if server is not configured', () => {
        expect(service.hasServerConfig('https://example.com')).toBe(false);
      });
    });

    describe('switchToConfig', () => {
      it('should switch between configurations', async () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        const serverConfig =
          await service.addServerConfig('https://server.com');

        expect(service.getMode()).toBe('local');

        service.switchToConfig(serverConfig.id);

        expect(service.getMode()).toBe('server');
        expect(service.getServerUrl()).toBe('https://server.com');
      });
    });

    describe('removeConfig', () => {
      it('should remove a configuration', async () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        const serverConfig =
          await service.addServerConfig('https://server.com');

        expect(service.getConfigurations()).toHaveLength(2);

        service.removeConfig(serverConfig.id);

        expect(service.getConfigurations()).toHaveLength(1);
      });
    });

    describe('updateConfigDisplayName', () => {
      it('should update display name', async () => {
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        const config = await service.addServerConfig(
          'https://server.com',
          'Old Name'
        );
        service.switchToConfig(config.id);

        service.updateConfigDisplayName(config.id, 'New Name');

        expect(service.getConfigById(config.id)?.displayName).toBe('New Name');
      });
    });

    describe('updateConfigUserProfile', () => {
      it('should update user profile for a config', () => {
        service.configureLocalMode({ name: 'Old', username: 'old' });

        service.updateConfigUserProfile(LOCAL_CONFIG_ID, {
          name: 'New Name',
          username: 'newuser',
          avatarUrl: 'https://example.com/avatar.png',
        });

        const profile = service.getActiveConfig()?.userProfile;
        expect(profile?.name).toBe('New Name');
        expect(profile?.username).toBe('newuser');
      });
    });

    describe('getStoragePrefix', () => {
      it('should return local prefix for local mode', () => {
        service.configureLocalMode({ name: 'Local', username: 'local' });
        expect(service.getStoragePrefix()).toBe('local:');
      });

      it('should return server prefix for server mode', async () => {
        (globalThis.fetch as Mock).mockResolvedValue({ ok: true });
        await service.configureServerMode('https://example.com');
        expect(service.getStoragePrefix()).toMatch(/^srv:[a-f0-9]{8}:$/);
      });
    });

    describe('getStorageContext', () => {
      it('should return the StorageContextService instance', () => {
        const context = service.getStorageContext();
        expect(context).toBeInstanceOf(StorageContextService);
      });
    });
  });
});
