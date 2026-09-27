import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  APP_CONFIG_STORAGE_KEY,
  type AppConfigV2,
  buildCloudConfigId,
  buildLocalConfigId,
  buildServerConfigId,
  extractContextPrefix,
  getCloudProviderDisplayName,
  getLocalConfigDisplayName,
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
        expect(config.displayName).toBe('Browser');
        expect(config.userProfile?.username).toBe('localuser');
        expect(service.getConfigurations()).toHaveLength(1);
      });

      it('should update the existing profile for the same username', () => {
        service.addLocalConfig({ name: 'User 1', username: 'user1' });
        service.addLocalConfig({ name: 'User One', username: 'user1' });

        expect(service.getConfigurations()).toHaveLength(1);
        expect(service.getActiveConfig()?.userProfile?.name).toBe('User One');
      });

      it('should keep a second Browser username as a separate profile', () => {
        service.addLocalConfig({ name: 'User 1', username: 'user1' });
        const second = service.addLocalConfig({
          name: 'User 2',
          username: 'user2',
        });

        expect(service.getConfigurations()).toHaveLength(2);
        expect(second.id).toBe(buildLocalConfigId('user2'));
        // Adding does not switch; the first profile stays active
        expect(service.getActiveConfig()?.userProfile?.username).toBe('user1');
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

  describe('multiple profiles per kind', () => {
    it('gives a second Browser username its own id and prefix', () => {
      const first = service.addLocalConfig({
        name: 'A',
        username: 'testuserA',
      });
      const second = service.addLocalConfig({
        name: 'B',
        username: 'testuserB',
      });
      const firstAgain = service.addLocalConfig({
        name: 'A renamed',
        username: 'TestUserA',
      });

      expect(first.id).toBe(LOCAL_CONFIG_ID);
      expect(second.id).toBe(buildLocalConfigId('testuserB'));
      expect(second.id.startsWith('local-')).toBe(true);
      expect(firstAgain.id).toBe(LOCAL_CONFIG_ID);
      expect(firstAgain.userProfile?.name).toBe('A renamed');
      expect(
        service.getConfigurations().filter(c => c.type === 'local')
      ).toHaveLength(2);
      expect(service.getPrefixForConfig(second.id)).toBe(`${second.id}:`);
      expect(extractContextPrefix(`${second.id}:inkweld-media`)).toBe(
        `${second.id}:`
      );
    });

    it('keeps one server profile per author on the same server', () => {
      const url = 'https://ink.example.com';
      const shared = service.addServerConfig(url, 'Ink');
      // First login claims the unbound profile
      const alice = service.addServerConfig(url, undefined, undefined, {
        username: 'alice',
      });
      service.updateConfigUserProfile(alice.id, {
        name: 'Alice',
        username: 'alice',
      });
      // Second author gets a separate profile
      const bob = service.addServerConfig(url, undefined, undefined, {
        username: 'bob',
      });
      const aliceAgain = service.addServerConfig(url, undefined, undefined, {
        username: 'Alice',
      });

      expect(alice.id).toBe(shared.id);
      expect(bob.id).toBe(buildServerConfigId(shared.id, 'bob'));
      expect(bob.id).not.toBe(shared.id);
      expect(aliceAgain.id).toBe(shared.id);
      expect(service.getPrefixForConfig(bob.id)).toBe(`srv:${bob.id}:`);
      expect(extractContextPrefix(`srv:${bob.id}:auth_token`)).toBe(
        `srv:${bob.id}:`
      );
    });

    it('adoptServerLogin binds in place for the same or no user, forks for another', () => {
      const url = 'https://ink.example.com';
      const shared = service.addServerConfig(url, 'Ink');
      service.switchToConfig(shared.id);

      const first = service.adoptServerLogin({
        name: 'Alice',
        username: 'alice',
      });
      expect(first.forkedFrom).toBeNull();
      expect(first.config.id).toBe(shared.id);

      const same = service.adoptServerLogin({
        name: 'Alice B',
        username: 'ALICE',
      });
      expect(same.forkedFrom).toBeNull();
      expect(service.getConfigById(shared.id)?.userProfile?.name).toBe(
        'Alice B'
      );

      const forked = service.adoptServerLogin({ name: 'Bob', username: 'bob' });
      expect(forked.forkedFrom).toBe(shared.id);
      expect(forked.config.id).toBe(buildServerConfigId(shared.id, 'bob'));
      expect(forked.config.displayName).toBe('Ink');
      expect(service.getActiveConfig()?.id).toBe(forked.config.id);
      // Alice's profile is untouched by Bob's fork (her last login wrote the
      // username as typed, matched case-insensitively)
      expect(service.getConfigById(shared.id)?.userProfile?.username).toBe(
        'ALICE'
      );
    });

    it('gives a second author on one cloud account a separate profile', () => {
      const first = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:1',
        userProfile: { name: 'A', username: 'alice' },
      });
      const second = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:1',
        userProfile: { name: 'B', username: 'bob' },
      });
      const firstAgain = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:1',
        userProfile: { name: 'Alice!', username: 'ALICE' },
      });
      const otherAccount = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:2',
        userProfile: { name: 'A', username: 'alice' },
      });

      expect(first.id).toBe(buildCloudConfigId('dropbox', 'dbid:1'));
      expect(second.id).toBe(buildCloudConfigId('dropbox', 'dbid:1', 'bob'));
      expect(firstAgain.id).toBe(first.id);
      expect(firstAgain.userProfile?.name).toBe('Alice!');
      expect(otherAccount.id).toBe(buildCloudConfigId('dropbox', 'dbid:2'));
      expect(extractContextPrefix(`${second.id}:inkweld-media`)).toBe(
        `${second.id}:`
      );
      expect(service.getPrefixForConfig(second.id)).toBe(`${second.id}:`);
    });

    it('adoptServerLogin refuses outside a server profile', () => {
      service.addLocalConfig({ name: 'A', username: 'a' });
      expect(() =>
        service.adoptServerLogin({ name: 'A', username: 'a' })
      ).toThrow();
    });
  });

  describe('cloneContextData', () => {
    function openWithStores(name: string): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('updates', { autoIncrement: true });
          const custom = db.createObjectStore('custom', { keyPath: 'id' });
          custom.createIndex('byName', 'name', { unique: false });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
    }

    function deleteDb(name: string): Promise<void> {
      return new Promise(resolve => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }

    function readStore(
      name: string,
      store: string
    ): Promise<{ key: IDBValidKey; value: unknown }[]> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const out: { key: IDBValidKey; value: unknown }[] = [];
          const cursorReq = db
            .transaction(store, 'readonly')
            .objectStore(store)
            .openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) {
              db.close();
              resolve(out);
              return;
            }
            out.push({ key: cursor.primaryKey, value: cursor.value });
            cursor.continue();
          };
          cursorReq.onerror = () =>
            reject(cursorReq.error ?? new Error('cursor failed'));
        };
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
    }

    it('copies keys and databases into the target prefix, leaving the source intact', async () => {
      const source = service.addServerConfig('https://clone-spec.example.com');
      const src = service.getPrefixForConfig(source.id);
      const target = service.addCloudConfig({
        provider: 'dropbox',
        accountId: 'dbid:clone-spec',
      });
      mockStorage[`${src}inkweld-local-projects`] = JSON.stringify([
        { slug: 'one' },
        { slug: 'two' },
      ]);
      mockStorage[`${src}userSettings`] = '{"theme":"dark"}';
      mockStorage[`${target.id}:userSettings`] = '{"theme":"light"}';
      mockStorage['srv:abc12345:auth_token'] = 't';

      const db = await openWithStores(`${src}a:one:elements`);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['updates', 'custom'], 'readwrite');
        tx.objectStore('updates').put(new Uint8Array([1, 2, 3]));
        tx.objectStore('updates').put(new Uint8Array([4]));
        tx.objectStore('custom').put({ id: 'k', name: 'n' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      });
      db.close();

      const result = await service.cloneContextData(source.id, target.id);

      expect(result).toEqual({
        databases: 1,
        localStorageKeys: 1, // userSettings already existed on the target
        projectCount: 2,
      });
      expect(mockStorage[`${target.id}:inkweld-local-projects`]).toBe(
        mockStorage[`${src}inkweld-local-projects`]
      );
      // Existing target values are never overwritten
      expect(mockStorage[`${target.id}:userSettings`]).toBe(
        '{"theme":"light"}'
      );
      // Other prefixes untouched
      expect(mockStorage['srv:abc12345:auth_token']).toBe('t');

      const updates = await readStore(`${target.id}:a:one:elements`, 'updates');
      expect(updates.map(u => u.key)).toEqual([1, 2]);
      expect(Array.from(updates[0].value as Uint8Array)).toEqual([1, 2, 3]);
      const custom = await readStore(`${target.id}:a:one:elements`, 'custom');
      expect(custom).toEqual([{ key: 'k', value: { id: 'k', name: 'n' } }]);
      // Source still there
      expect(await readStore(`${src}a:one:elements`, 'updates')).toHaveLength(
        2
      );

      // fake-indexeddb is shared across specs: leave no databases behind
      await deleteDb(`${src}a:one:elements`);
      await deleteDb(`${target.id}:a:one:elements`);
    });
  });

  describe('renameProjectInContext', () => {
    function open(
      name: string,
      setup: (db: IDBDatabase) => void
    ): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => setup(req.result);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
    }
    function write(
      db: IDBDatabase,
      store: string,
      value: unknown,
      key?: IDBValidKey
    ): Promise<void> {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        if (key === undefined) tx.objectStore(store).put(value);
        else tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('write failed'));
      });
    }
    function keysOf(name: string, store: string): Promise<IDBValidKey[]> {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => {
          const db = req.result;
          const all = db
            .transaction(store, 'readonly')
            .objectStore(store)
            .getAllKeys();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error ?? new Error('keys failed'));
        };
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
    }
    function dbExists(name: string): Promise<boolean> {
      return indexedDB.databases().then(all => all.some(d => d.name === name));
    }
    function drop(name: string): Promise<void> {
      return new Promise(resolve => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    }

    it('moves databases, composite records and the list entry to the new slug', async () => {
      service.addLocalConfig({ name: 'A', username: 'a' });
      mockStorage['local:inkweld-local-projects'] = JSON.stringify([
        { username: 'a', slug: 'novel', title: 'Novel' },
        { username: 'a', slug: 'other' },
      ]);
      const doc = await open('local:a:novel:elements', db => {
        db.createObjectStore('updates', { autoIncrement: true });
      });
      await write(doc, 'updates', new Uint8Array([9]));
      doc.close();
      const media = await open('local:inkweld-media', db => {
        db.createObjectStore('media', { keyPath: 'id' });
      });
      await write(media, 'media', { id: 'a/novel:m1', projectKey: 'a/novel' });
      await write(media, 'media', { id: 'a/other:m2', projectKey: 'a/other' });
      media.close();
      const acts = await open('local:inkweld-activations', db => {
        db.createObjectStore('activations', { keyPath: 'projectKey' });
      });
      await write(acts, 'activations', { projectKey: 'a/novel' });
      acts.close();

      await service.renameProjectInContext(
        LOCAL_CONFIG_ID,
        'a',
        'novel',
        'my-novel'
      );

      expect(await dbExists('local:a:my-novel:elements')).toBe(true);
      expect(await dbExists('local:a:novel:elements')).toBe(false);
      expect((await keysOf('local:inkweld-media', 'media')).sort()).toEqual([
        'a/my-novel:m1',
        'a/other:m2',
      ]);
      expect(await keysOf('local:inkweld-activations', 'activations')).toEqual([
        'a/my-novel',
      ]);
      const list = JSON.parse(mockStorage['local:inkweld-local-projects']) as {
        slug: string;
      }[];
      expect(list.map(p => p.slug)).toEqual(['my-novel', 'other']);

      for (const name of [
        'local:a:my-novel:elements',
        'local:inkweld-media',
        'local:inkweld-activations',
      ]) {
        await drop(name);
      }
    });
  });

  describe('activateProjectsInContext', () => {
    it('writes an activation record for every listed project', async () => {
      service.addLocalConfig({ name: 'A', username: 'a' });
      mockStorage['local:inkweld-local-projects'] = JSON.stringify([
        { username: 'a', slug: 'one' },
        { username: 'a', slug: 'two' },
      ]);

      const count = await service.activateProjectsInContext(LOCAL_CONFIG_ID);

      expect(count).toBe(2);
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = indexedDB.open('local:inkweld-activations');
        req.onsuccess = () => {
          const db = req.result;
          const all = db
            .transaction('activations', 'readonly')
            .objectStore('activations')
            .getAllKeys();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error ?? new Error('keys failed'));
        };
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });
      expect(keys.sort()).toEqual(['a/one', 'a/two']);
      await new Promise<void>(resolve => {
        const del = indexedDB.deleteDatabase('local:inkweld-activations');
        del.onsuccess = () => resolve();
        del.onerror = () => resolve();
        del.onblocked = () => resolve();
      });
    });
  });

  describe('recordMigration', () => {
    it('notes the move on both connections', () => {
      service.addLocalConfig({ name: 'B', username: 'b' });
      const target = service.addServerConfig('https://ink.example.com', 'Ink');

      service.recordMigration(LOCAL_CONFIG_ID, target.id, {
        username: 'bobby',
        projectCount: 2,
      });

      const local = service.getConfigById(LOCAL_CONFIG_ID);
      const server = service.getConfigById(target.id);
      expect(local?.migratedTo).toMatchObject({
        configId: target.id,
        displayName: 'Ink',
        username: 'bobby',
        projectCount: 2,
      });
      expect(server?.migratedFrom).toMatchObject({
        configId: LOCAL_CONFIG_ID,
        displayName: 'Browser',
        projectCount: 2,
      });
      expect(
        getLocalConfigDisplayName({ ...local!, displayName: 'Local Mode' })
      ).toBe('Browser');
    });

    it('ignores unknown connections', () => {
      service.addLocalConfig({ name: 'B', username: 'b' });
      service.recordMigration(LOCAL_CONFIG_ID, 'missing', { projectCount: 1 });
      expect(
        service.getConfigById(LOCAL_CONFIG_ID)?.migratedTo
      ).toBeUndefined();
    });
  });

  describe('device storage scanning', () => {
    it('extractContextPrefix recognises every prefix shape', () => {
      expect(extractContextPrefix('local:inkweld-media')).toBe('local:');
      expect(extractContextPrefix('srv:abc12345:auth_token')).toBe(
        'srv:abc12345:'
      );
      expect(extractContextPrefix('cloud-dropbox-1a2b3c:inkweld-sync')).toBe(
        'cloud-dropbox-1a2b3c:'
      );
      expect(extractContextPrefix('cloud-google-drive-ff00:x')).toBe(
        'cloud-google-drive-ff00:'
      );
      expect(extractContextPrefix('inkweld-app-config')).toBeNull();
    });

    it('describeContextData lists databases and keys under the prefix', async () => {
      // A dedicated server profile: fake-indexeddb is shared across spec
      // files, so the common "local:" prefix may hold other suites' databases
      const config = service.addServerConfig(
        'https://describe-spec.example.com'
      );
      const prefix = service.getPrefixForConfig(config.id);
      mockStorage[`${prefix}userSettings`] = '{}';
      mockStorage['srv:abc12345:auth_token'] = 't';
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(`${prefix}inkweld-media`, 1);
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
        req.onerror = () => reject(req.error ?? new Error('open failed'));
      });

      const summary = await service.describeContextData(config.id);

      expect(summary.prefix).toBe(prefix);
      expect(summary.databases).toEqual([`${prefix}inkweld-media`]);
      expect(summary.localStorageKeys).toEqual([`${prefix}userSettings`]);

      await service.clearContextData(config.id);
      expect(await service.describeContextData(config.id)).toEqual({
        prefix,
        databases: [],
        localStorageKeys: [],
      });
    });

    it('findOrphanedData reports prefixes with no configuration', async () => {
      service.addLocalConfig({ name: 'B', username: 'b' });
      mockStorage['local:userSettings'] = '{}';
      mockStorage['srv:dead0000:auth_token'] = 't';
      mockStorage['srv:dead0000:userSettings'] = '{}';
      mockStorage['cloud-dropbox-beef:inkweld-local-projects'] = '[]';

      const orphans = await service.findOrphanedData();

      const prefixes = orphans.map(o => o.prefix);
      expect(prefixes).toEqual(
        expect.arrayContaining(['cloud-dropbox-beef:', 'srv:dead0000:'])
      );
      expect(prefixes).not.toContain('local:');
      expect(
        orphans.find(o => o.prefix === 'srv:dead0000:')?.localStorageKeys
      ).toHaveLength(2);
    });

    it('clearContextData removes only that prefix', async () => {
      const config = service.addServerConfig('https://clear-spec.example.com');
      const prefix = service.getPrefixForConfig(config.id);
      mockStorage[`${prefix}userSettings`] = '{}';
      mockStorage['srv:abc12345:auth_token'] = 't';

      await service.clearContextData(config.id);

      expect(mockStorage[`${prefix}userSettings`]).toBeUndefined();
      expect(mockStorage['srv:abc12345:auth_token']).toBe('t');
      expect(mockStorage[APP_CONFIG_STORAGE_KEY]).toBeDefined();
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
