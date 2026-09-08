import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  APP_CONFIG_STORAGE_KEY,
  type AppConfigV2,
  buildCloudConfigId,
  getCloudProviderDisplayName,
  isLocalOrCloudMode,
  LOCAL_CONFIG_ID,
  StorageContextService,
} from './storage-context.service';

describe('StorageContextService', () => {
  let service: StorageContextService;
  let mockStorage: Record<string, string>;
  let originalLocalStorageDescriptor: PropertyDescriptor | undefined;

  /**
   * Helper to create a fresh service instance with a clean localStorage mock.
   * Call this instead of using the default `service` when you need to pre-populate storage.
   */
  function _createFreshService(): StorageContextService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [provideZonelessChangeDetection(), StorageContextService],
    });
    return TestBed.inject(StorageContextService);
  }

  beforeEach(() => {
    // Reset mock storage to a fresh empty object
    mockStorage = {};
    originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    );

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

    Object.defineProperty(globalThis, 'localStorage', {
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
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        globalThis,
        'localStorage',
        originalLocalStorageDescriptor
      );
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
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

    it('should load v2 config from localStorage', () => {
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
      expect(config!.version).toBe(2);
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

  describe('getApiBaseUrl', () => {
    it('returns the runtime-configured server URL when a server config is active', () => {
      service.addServerConfig('https://my-server.example.com/');
      expect(service.getApiBaseUrl()).toBe('https://my-server.example.com');
    });

    it('falls back to the build-time environment default in local mode', () => {
      service.addLocalConfig({ name: 'Local User', username: 'localuser' });
      expect(service.getApiBaseUrl()).toBe(environment.apiUrl);
    });
  });

  describe('configuration management', () => {
    describe('addLocalConfig', () => {
      it('should add local config as first config', () => {
        service.addLocalConfig({
          name: 'Local User',
          username: 'localuser',
        });
        const config = service.getConfigurations()[0];

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

    describe('clearConfigUserProfile', () => {
      it('should clear user profile from config', () => {
        service.addLocalConfig({ name: 'Test', username: 'testuser' });
        service.updateConfigUserProfile(LOCAL_CONFIG_ID, {
          name: 'Test User',
          username: 'testuser',
        });
        expect(service.getActiveConfig()?.userProfile).toBeDefined();

        service.clearConfigUserProfile(LOCAL_CONFIG_ID);

        expect(service.getActiveConfig()?.userProfile).toBeUndefined();
      });

      it('should do nothing when no config is loaded', () => {
        const freshService = _createFreshService();
        expect(() =>
          freshService.clearConfigUserProfile('non-existent-id')
        ).not.toThrow();
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
  describe('cloud sync configurations', () => {
    it('builds a stable, provider-scoped config id from the account id', () => {
      const id = buildCloudConfigId('dropbox', 'dbid:abc');
      expect(id).toMatch(/^cloud-dropbox-[0-9a-f]+$/);
      expect(buildCloudConfigId('dropbox', 'dbid:abc')).toBe(id);
      expect(buildCloudConfigId('dropbox', 'dbid:other')).not.toBe(id);
      expect(buildCloudConfigId('google-drive', 'dbid:abc')).not.toBe(id);
    });

    it('addCloudConfig adds and activates the first config', () => {
      const config = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'bobby@example.com',
        userProfile: { name: 'Bobby', username: 'bobby' },
      });

      expect(config.type).toBe('cloud');
      expect(config.cloudProvider).toBe('dropbox');
      expect(config.cloudAccountId).toBe('dbid:abc');
      expect(config.cloudAccountLabel).toBe('bobby@example.com');
      expect(config.displayName).toBe('Dropbox');
      expect(service.getActiveConfig()?.id).toBe(config.id);
      expect(service.getMode()).toBe('cloud');
    });

    it('uses a cloud-specific storage prefix', () => {
      const config = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:abc',
      });
      expect(service.getPrefix()).toBe(`${config.id}:`);
      expect(service.prefixDbName('inkweld-media')).toBe(
        `${config.id}:inkweld-media`
      );
      expect(service.getPrefixForConfig(config.id)).toBe(`${config.id}:`);
    });

    it('keeps two accounts on the same provider in separate contexts', () => {
      const a = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:a',
      });
      const b = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:b',
      });
      expect(a.id).not.toBe(b.id);
      expect(service.getConfigurations()).toHaveLength(2);
    });

    it('updates an existing config for the same account without duplicating', () => {
      service.addLocalConfig();
      const first = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'old@example.com',
      });
      const second = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:abc',
        accountLabel: 'new@example.com',
        userProfile: { name: 'Bobby', username: 'bobby' },
      });

      expect(second.id).toBe(first.id);
      expect(service.getConfigurations()).toHaveLength(2);
      expect(second.cloudAccountLabel).toBe('new@example.com');
      expect(second.userProfile?.username).toBe('bobby');
      // Adding does not switch away from the active (local) config
      expect(service.getActiveConfig()?.id).toBe(LOCAL_CONFIG_ID);
    });

    it('reports cloud mode as local-like and not server', () => {
      service.addCloudConfig({ provider: 'dropbox', accountId: 'x' });
      expect(service.isLocalMode()).toBe(true);
      expect(service.isCloudMode()).toBe(true);
      expect(service.isServerMode()).toBe(false);
      expect(service.getServerUrl()).toBeUndefined();
      expect(service.getWebSocketUrl()).toBeUndefined();
    });

    it('isLocalMode is false for server mode and when unconfigured', () => {
      expect(service.isLocalMode()).toBe(false);
      service.addServerConfig('https://api.example.com');
      expect(service.isLocalMode()).toBe(false);
      expect(service.isServerMode()).toBe(true);
    });

    it('isLocalOrCloudMode helper', () => {
      expect(isLocalOrCloudMode('local')).toBe(true);
      expect(isLocalOrCloudMode('cloud')).toBe(true);
      expect(isLocalOrCloudMode('server')).toBe(false);
      expect(isLocalOrCloudMode(null)).toBe(false);
      expect(isLocalOrCloudMode(undefined)).toBe(false);
    });

    it('getCloudProviderDisplayName', () => {
      expect(getCloudProviderDisplayName('dropbox')).toBe('Dropbox');
      expect(getCloudProviderDisplayName('google-drive')).toBe('Google Drive');
      expect(getCloudProviderDisplayName('onedrive')).toBe('OneDrive');
    });
  });
});
