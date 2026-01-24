import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_CONFIG_STORAGE_KEY,
  AppConfigV2,
  LegacyAppConfig,
  LOCAL_CONFIG_ID,
  StorageContextService,
} from './storage-context.service';

describe('StorageContextService', () => {
  let service: StorageContextService;
  let mockStorage: Record<string, string>;

  /**
   * Helper to create a fresh service instance with a clean localStorage mock.
   * Call this instead of using the default `service` when you need to pre-populate storage.
   */
  function _createFreshService(): StorageContextService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), StorageContextService],
    });
    return TestBed.inject(StorageContextService);
  }

  beforeEach(() => {
    // Reset mock storage to a fresh empty object
    mockStorage = {};

    // Mock localStorage by replacing window.localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      key: vi.fn((index: number) => {
        const keys = Object.keys(mockStorage);
        return keys[index] ?? null;
      }),
      get length() {
        return Object.keys(mockStorage).length;
      },
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    };

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), StorageContextService],
    });

    service = TestBed.inject(StorageContextService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create the service', () => {
      expect(service).toBeTruthy();
    });

    it('should return null config when localStorage is empty', () => {
      expect(service.getConfig()).toBeNull();
      expect(service.getActiveConfig()).toBeNull();
      expect(service.isConfigured()).toBe(false);
    });

    it('should default to local prefix when no config exists', () => {
      expect(service.getPrefix()).toBe('local:');
    });
  });

  describe('v1 to v2 migration', () => {
    it('should migrate local mode v1 config to v2', () => {
      const legacyConfig: LegacyAppConfig = {
        mode: 'local',
        userProfile: {
          name: 'Test User',
          username: 'testuser',
        },
      };
      mockStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(legacyConfig);

      // Reload service to trigger migration
      service.reloadConfig();

      const config = service.getConfig();
      expect(config).not.toBeNull();
      expect(config!.version).toBe(2);
      expect(config!.activeConfigId).toBe(LOCAL_CONFIG_ID);
      expect(config!.configurations).toHaveLength(1);
      expect(config!.configurations[0].type).toBe('local');
      expect(config!.configurations[0].userProfile?.username).toBe('testuser');
    });

    it('should migrate server mode v1 config to v2', () => {
      const legacyConfig: LegacyAppConfig = {
        mode: 'server',
        serverUrl: 'https://inkweld.example.com',
        userProfile: {
          name: 'Server User',
          username: 'serveruser',
        },
      };
      mockStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(legacyConfig);

      service.reloadConfig();

      const config = service.getConfig();
      expect(config).not.toBeNull();
      expect(config!.version).toBe(2);
      expect(config!.configurations).toHaveLength(1);
      expect(config!.configurations[0].type).toBe('server');
      expect(config!.configurations[0].serverUrl).toBe(
        'https://inkweld.example.com'
      );
      expect(config!.configurations[0].displayName).toBe('inkweld.example.com');
    });

    it('should not migrate already v2 config', () => {
      const v2Config: AppConfigV2 = {
        version: 2,
        activeConfigId: 'local',
        configurations: [
          {
            id: 'local',
            type: 'local',
            displayName: 'My Local',
            addedAt: '2025-01-01T00:00:00Z',
            lastUsedAt: '2025-01-01T00:00:00Z',
          },
        ],
      };
      mockStorage[APP_CONFIG_STORAGE_KEY] = JSON.stringify(v2Config);

      service.reloadConfig();

      const config = service.getConfig();
      expect(config!.configurations[0].displayName).toBe('My Local');
    });
  });

  describe('prefix generation', () => {
    it('should return "local:" prefix for local mode', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });

      expect(service.getPrefix()).toBe('local:');
    });

    it('should return "srv:{hash}:" prefix for server mode', () => {
      service.addServerConfig('https://inkweld.example.com');
      service.switchToConfig(
        service.hashServerUrl('https://inkweld.example.com')
      );

      const prefix = service.getPrefix();
      expect(prefix).toMatch(/^srv:[a-f0-9]{8}:$/);
    });

    it('should generate consistent hash for same URL', () => {
      const hash1 = service.hashServerUrl('https://inkweld.example.com');
      const hash2 = service.hashServerUrl('https://inkweld.example.com');
      expect(hash1).toBe(hash2);
    });

    it('should normalize URLs before hashing', () => {
      const hash1 = service.hashServerUrl('https://inkweld.example.com/');
      const hash2 = service.hashServerUrl('https://inkweld.example.com');
      const hash3 = service.hashServerUrl('HTTPS://INKWELD.EXAMPLE.COM');
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should generate different hashes for different URLs', () => {
      const hash1 = service.hashServerUrl('https://server1.example.com');
      const hash2 = service.hashServerUrl('https://server2.example.com');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('prefixKey', () => {
    it('should prefix a key with current context', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });

      expect(service.prefixKey('inkweld-media')).toBe('local:inkweld-media');
    });

    it('should prefix with server context when in server mode', () => {
      service.addServerConfig('https://example.com');
      service.switchToConfig(service.hashServerUrl('https://example.com'));

      const key = service.prefixKey('inkweld-media');
      expect(key).toMatch(/^srv:[a-f0-9]{8}:inkweld-media$/);
    });
  });

  describe('prefixDbName', () => {
    it('should prefix database name with current context', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });

      expect(service.prefixDbName('inkweld-snapshots')).toBe(
        'local:inkweld-snapshots'
      );
    });
  });

  describe('prefixDocumentId', () => {
    it('should prefix Yjs document ID with current context', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });

      expect(service.prefixDocumentId('alice:my-novel:elements')).toBe(
        'local:alice:my-novel:elements'
      );
    });
  });

  describe('configuration management', () => {
    describe('addLocalConfig', () => {
      it('should add local config as first config', () => {
        const config = service.addLocalConfig({
          name: 'Local User',
          username: 'localuser',
        });

        expect(config.id).toBe(LOCAL_CONFIG_ID);
        expect(config.type).toBe('local');
        expect(config.displayName).toBe('Local Mode');
        expect(config.userProfile?.username).toBe('localuser');
        expect(service.getConfigurations()).toHaveLength(1);
      });

      it('should update existing local config', () => {
        service.addLocalConfig({ name: 'User 1', username: 'user1' });
        service.addLocalConfig({ name: 'User 2', username: 'user2' });

        expect(service.getConfigurations()).toHaveLength(1);
        expect(service.getActiveConfig()?.userProfile?.username).toBe('user2');
      });
    });

    describe('addServerConfig', () => {
      it('should add server config', () => {
        const config = service.addServerConfig(
          'https://inkweld.example.com',
          'My Writing Server'
        );

        expect(config.type).toBe('server');
        expect(config.serverUrl).toBe('https://inkweld.example.com');
        expect(config.displayName).toBe('My Writing Server');
        expect(service.getConfigurations()).toHaveLength(1);
      });

      it('should use hostname as default display name', () => {
        const config = service.addServerConfig('https://inkweld.example.com');

        expect(config.displayName).toBe('inkweld.example.com');
      });

      it('should update existing server config with same URL', () => {
        service.addServerConfig('https://example.com', 'Server 1');
        service.addServerConfig('https://example.com', 'Server 2');

        expect(service.getConfigurations()).toHaveLength(1);
        expect(service.getConfigurations()[0].displayName).toBe('Server 2');
      });

      it('should add multiple different servers', () => {
        service.addServerConfig('https://server1.com');
        service.addServerConfig('https://server2.com');

        expect(service.getConfigurations()).toHaveLength(2);
      });
    });

    describe('removeConfig', () => {
      it('should remove a configuration', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        service.addServerConfig('https://example.com');

        service.removeConfig(service.hashServerUrl('https://example.com'));

        expect(service.getConfigurations()).toHaveLength(1);
        expect(service.getConfigurations()[0].type).toBe('local');
      });

      it('should switch to another config when removing active config', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        const serverConfig = service.addServerConfig('https://example.com');
        service.switchToConfig(serverConfig.id);

        expect(service.getActiveConfig()?.id).toBe(serverConfig.id);

        service.removeConfig(serverConfig.id);

        expect(service.getActiveConfig()?.id).toBe(LOCAL_CONFIG_ID);
      });
    });

    describe('switchToConfig', () => {
      it('should switch active configuration', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        const serverConfig = service.addServerConfig('https://example.com');

        expect(service.getActiveConfig()?.type).toBe('local');

        service.switchToConfig(serverConfig.id);

        expect(service.getActiveConfig()?.id).toBe(serverConfig.id);
        expect(service.getActiveConfig()?.type).toBe('server');
      });

      it('should update lastUsedAt when switching', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        const serverConfig = service.addServerConfig('https://example.com');
        const originalLastUsed = serverConfig.lastUsedAt;

        // Wait a bit to ensure time difference
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-25T00:00:00Z'));

        service.switchToConfig(serverConfig.id);

        const updated = service.getConfigById(serverConfig.id);
        expect(updated?.lastUsedAt).not.toBe(originalLastUsed);

        vi.useRealTimers();
      });

      it('should not fail when switching to non-existent config', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });

        expect(() => service.switchToConfig('nonexistent')).not.toThrow();
        expect(service.getActiveConfig()?.id).toBe(LOCAL_CONFIG_ID);
      });
    });

    describe('updateConfigDisplayName', () => {
      it('should update display name', () => {
        service.addServerConfig('https://example.com', 'Old Name');
        const configId = service.hashServerUrl('https://example.com');

        service.updateConfigDisplayName(configId, 'New Name');

        expect(service.getConfigById(configId)?.displayName).toBe('New Name');
      });
    });

    describe('updateConfigUserProfile', () => {
      it('should update user profile', () => {
        service.addLocalConfig({ name: 'Old', username: 'old' });

        service.updateConfigUserProfile(LOCAL_CONFIG_ID, {
          name: 'New Name',
          username: 'newuser',
          avatarUrl: 'https://example.com/avatar.png',
        });

        const profile = service.getActiveConfig()?.userProfile;
        expect(profile?.name).toBe('New Name');
        expect(profile?.username).toBe('newuser');
        expect(profile?.avatarUrl).toBe('https://example.com/avatar.png');
      });
    });

    describe('hasServerConfig', () => {
      it('should return true if server is configured', () => {
        service.addServerConfig('https://example.com');

        expect(service.hasServerConfig('https://example.com')).toBe(true);
        expect(service.hasServerConfig('https://example.com/')).toBe(true);
        expect(service.hasServerConfig('HTTPS://EXAMPLE.COM')).toBe(true);
      });

      it('should return false if server is not configured', () => {
        expect(service.hasServerConfig('https://example.com')).toBe(false);
      });
    });
  });

  describe('helper methods', () => {
    describe('getMode', () => {
      it('should return "local" for local mode', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        expect(service.getMode()).toBe('local');
      });

      it('should return "server" for server mode', () => {
        const config = service.addServerConfig('https://example.com');
        service.switchToConfig(config.id);
        expect(service.getMode()).toBe('server');
      });

      it('should default to "local" when no config', () => {
        expect(service.getMode()).toBe('local');
      });
    });

    describe('getServerUrl', () => {
      it('should return undefined for local mode', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        expect(service.getServerUrl()).toBeUndefined();
      });

      it('should return server URL for server mode', () => {
        const config = service.addServerConfig('https://example.com');
        service.switchToConfig(config.id);
        expect(service.getServerUrl()).toBe('https://example.com');
      });
    });

    describe('getWebSocketUrl', () => {
      it('should return undefined for local mode', () => {
        service.addLocalConfig({ name: 'Test', username: 'test' });
        expect(service.getWebSocketUrl()).toBeUndefined();
      });

      it('should return wss URL for https server', () => {
        const config = service.addServerConfig('https://example.com');
        service.switchToConfig(config.id);
        expect(service.getWebSocketUrl()).toBe('wss://example.com');
      });

      it('should return ws URL for http server', () => {
        const config = service.addServerConfig('http://localhost:8333');
        service.switchToConfig(config.id);
        expect(service.getWebSocketUrl()).toBe('ws://localhost:8333');
      });
    });
  });

  describe('clearConfig', () => {
    it('should remove config from localStorage', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });
      expect(mockStorage[APP_CONFIG_STORAGE_KEY]).toBeDefined();

      service.clearConfig();

      expect(mockStorage[APP_CONFIG_STORAGE_KEY]).toBeUndefined();
      expect(service.getConfig()).toBeNull();
    });
  });

  describe('computed signals', () => {
    it('should update isConfigured when config changes', () => {
      expect(service.isConfigured()).toBe(false);

      service.addLocalConfig({ name: 'Test', username: 'test' });

      expect(service.isConfigured()).toBe(true);
    });

    it('should update isLocalMode when switching configs', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });
      const serverConfig = service.addServerConfig('https://example.com');

      expect(service.isLocalMode()).toBe(true);

      service.switchToConfig(serverConfig.id);

      expect(service.isLocalMode()).toBe(false);
    });

    it('should update prefix when switching configs', () => {
      service.addLocalConfig({ name: 'Test', username: 'test' });
      const serverConfig = service.addServerConfig('https://example.com');

      expect(service.prefix()).toBe('local:');

      service.switchToConfig(serverConfig.id);

      expect(service.prefix()).toMatch(/^srv:[a-f0-9]{8}:$/);
    });
  });

  describe('listLocalStorageKeysForContext', () => {
    it('should list keys for a specific context', () => {
      mockStorage['local:inkweld-projects'] = 'test1';
      mockStorage['local:inkweld-user'] = 'test2';
      mockStorage['srv:abc12345:inkweld-projects'] = 'test3';
      mockStorage['other-key'] = 'test4';

      const localKeys = service.listLocalStorageKeysForContext(LOCAL_CONFIG_ID);

      expect(localKeys).toHaveLength(2);
      expect(localKeys).toContain('local:inkweld-projects');
      expect(localKeys).toContain('local:inkweld-user');
    });
  });

  describe('edge cases', () => {
    it('should handle invalid JSON in localStorage', () => {
      mockStorage[APP_CONFIG_STORAGE_KEY] = 'invalid json {{{';

      expect(() => service.reloadConfig()).not.toThrow();
      expect(service.getConfig()).toBeNull();
    });

    it('should handle URL with port', () => {
      const config = service.addServerConfig('https://example.com:8443');
      expect(config.serverUrl).toBe('https://example.com:8443');
    });

    it('should handle localhost URLs', () => {
      const config = service.addServerConfig('http://localhost:8333');
      expect(config.displayName).toBe('localhost');
    });
  });
});
