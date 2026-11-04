import {
  DOCUMENT,
  Injector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  APP_CONFIG_STORAGE_KEY,
  type AppConfigV2,
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
            displayName: 'Browser',
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

  // Helper to create TestBed and inject services (call after setupMockStorage).
  // `doc` stands in for the page's document (its base URL).
  function createServices(doc?: Document) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        StorageContextService,
        AuthTokenService,
        ...(doc ? [{ provide: DOCUMENT, useValue: doc }] : []),
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
      },
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

    it('should set token for a specific config without touching the active one', () => {
      mockStorage[`srv:${hash1}:auth_token`] = 'active-token';

      service.setTokenForConfig(hash2, 'restored-token');

      expect(mockStorage[`srv:${hash2}:auth_token`]).toBe('restored-token');
      expect(service.getToken()).toBe('active-token');
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

  describe('getTokenForUrl', () => {
    const originalApiUrl = environment.apiUrl;

    /** A document served from `base`, like one with a `<base href>` */
    function documentAt(base: string): Document {
      const doc = document.implementation.createHTMLDocument('test');
      const baseEl = doc.createElement('base');
      baseEl.setAttribute('href', base);
      doc.head.appendChild(baseEl);
      return doc;
    }

    afterEach(() => {
      environment.apiUrl = originalApiUrl;
    });

    it('returns the token for URLs on the active server', () => {
      setupMockStorage('server', 'https://ink.example.com');
      createServices();
      service.setToken('tok');

      expect(service.getTokenForUrl('https://ink.example.com/api/v1/x')).toBe(
        'tok'
      );
      expect(
        service.getTokenForUrl('wss://ink.example.com/api/v1/ws/yjs')
      ).toBe('tok');
      expect(service.isActiveServerUrl('https://ink.example.com')).toBe(true);
    });

    it('returns null for any other server', () => {
      setupMockStorage('server', 'https://ink.example.com');
      createServices();
      service.setToken('tok');

      expect(
        service.getTokenForUrl('https://other.example.com/api')
      ).toBeNull();
      expect(service.getTokenForUrl('ws://ink.example.com/api')).toBeNull();
      expect(service.isActiveServerUrl('https://other.example.com')).toBe(
        false
      );
    });

    it('keeps the token inside the path of a path-prefixed server', () => {
      setupMockStorage('server', 'https://example.com/inkweld-a');
      createServices();
      service.setToken('tok');

      expect(
        service.getTokenForUrl('https://example.com/inkweld-a/api/v1/x')
      ).toBe('tok');
      expect(
        service.getTokenForUrl('wss://example.com/inkweld-a/api/v1/ws/yjs')
      ).toBe('tok');
      expect(
        service.getTokenForUrl('https://example.com/inkweld-b/api/v1/x')
      ).toBeNull();
      expect(service.getTokenForUrl('https://example.com/api/v1/x')).toBeNull();
    });

    it('resolves relative URLs against the page base URL', () => {
      setupMockStorage('server', 'https://example.com/inkweld');
      createServices(documentAt('https://example.com/inkweld/'));
      service.setToken('tok');

      expect(service.getTokenForUrl('api/v1/users/me')).toBe('tok');
      expect(service.getTokenForUrl('/api/v1/users/me')).toBeNull();
    });

    it('uses the page origin and base href for a server profile without a URL', () => {
      environment.apiUrl = '';
      setupMockStorage('server', '');
      createServices(documentAt('https://writers.example.com/'));
      service.setToken('tok');

      expect(service.getTokenForUrl('/api/v1/users/me')).toBe('tok');
      expect(
        service.getTokenForUrl('https://other.example.com/api/v1/users/me')
      ).toBeNull();
    });

    it('never returns a token for a Browser profile', () => {
      setupMockStorage('local');
      createServices(documentAt('https://writers.example.com/'));
      service.setToken('tok');

      expect(service.getTokenForUrl('/api/v1/users/me')).toBeNull();
      expect(service.isActiveServerUrl('/api/v1/users/me')).toBe(false);
    });
  });

  describe('moveToken', () => {
    it('carries a token from one profile prefix to another', () => {
      const serverUrl = 'https://ink.example.com';
      setupMockStorage('server', serverUrl);
      createServices();
      const fromId = hashUrl(serverUrl);
      service.setToken('tok');

      service.moveToken(fromId, `${fromId}-deadbeef`);

      expect(service.getTokenForConfig(fromId)).toBeNull();
      expect(service.getTokenForConfig(`${fromId}-deadbeef`)).toBe('tok');
      expect(mockStorage[`srv:${fromId}-deadbeef:auth_token`]).toBe('tok');
    });

    it('carries the server the token was stored for', () => {
      createServices();
      const storage = TestBed.inject(StorageContextService);
      const shared = storage.addServerConfig('https://ink.example.com', 'Ink', {
        name: 'Alice',
        username: 'alice',
      });
      storage.switchToConfig(shared.id);
      service.setToken('bob-token');
      const { config, forkedFrom } = storage.adoptServerLogin({
        name: 'Bob',
        username: 'bob',
      });

      service.moveToken(forkedFrom ?? '', config.id);

      expect(service.getToken()).toBe('bob-token');
      expect(mockStorage[`srv:${config.id}:auth_token_server`]).toBe(
        'https://ink.example.com'
      );
      expect(mockStorage[`srv:${shared.id}:auth_token`]).toBeUndefined();
      expect(mockStorage[`srv:${shared.id}:auth_token_server`]).toBeUndefined();
    });
  });

  describe('the server a token was stored for', () => {
    const serverA = 'https://example.com/inkweld-a';
    const serverB = 'https://example.com/inkweld-b';

    /** A second tab: its own profile list, read from the same storage */
    function openSecondTab(): {
      storage: StorageContextService;
      tokens: AuthTokenService;
    } {
      const storage = new StorageContextService();
      const injector = Injector.create({
        providers: [{ provide: StorageContextService, useValue: storage }],
        parent: TestBed.inject(Injector),
      });
      return {
        storage,
        tokens: runInInjectionContext(injector, () => new AuthTokenService()),
      };
    }

    /** Make a profile for `serverUrl` active in the first tab; returns its id */
    function useServer(serverUrl: string): string {
      const storage = TestBed.inject(StorageContextService);
      const config = storage.addServerConfig(serverUrl);
      storage.switchToConfig(config.id);
      return config.id;
    }

    beforeEach(() => {
      createServices();
    });

    it('is stored next to the token', () => {
      const id = useServer(`${serverA}/`);

      service.setToken('token-a');

      expect(mockStorage[`srv:${id}:auth_token`]).toBe('token-a');
      expect(mockStorage[`srv:${id}:auth_token_server`]).toBe(serverA);
    });

    it('is recorded for a token stored before it was kept', () => {
      const id = useServer(serverA);
      mockStorage[`srv:${id}:auth_token`] = 'token-a';

      expect(service.getTokenForUrl(`${serverA}/api/v1/users/me`)).toBe(
        'token-a'
      );
      expect(service.hasTokenForConfig(id)).toBe(true);
      expect(mockStorage[`srv:${id}:auth_token_server`]).toBe(serverA);
    });

    it('is removed with the token', () => {
      const id = useServer(serverA);
      service.setToken('token-a');

      service.clearToken();

      expect(mockStorage[`srv:${id}:auth_token`]).toBeUndefined();
      expect(mockStorage[`srv:${id}:auth_token_server`]).toBeUndefined();

      service.setTokenForConfig(id, 'token-a2');
      expect(mockStorage[`srv:${id}:auth_token_server`]).toBe(serverA);
      service.clearTokenForConfig(id);
      expect(mockStorage[`srv:${id}:auth_token`]).toBeUndefined();
      expect(mockStorage[`srv:${id}:auth_token_server`]).toBeUndefined();
    });

    it('keeps a token with its server when tabs disagree about an id', () => {
      // The first tab is signed in to server A
      const id = useServer(serverA);
      service.setToken('token-a');

      // A second tab removes that profile and adds server B, whose preferred
      // id is the one just freed, then signs in there
      const second = openSecondTab();
      second.tokens.clearTokenForConfig(id);
      second.storage.removeConfig(id);
      const b = second.storage.addServerConfig(serverB);
      second.storage.switchToConfig(b.id);
      second.tokens.setToken('token-b');
      expect(b.id).toBe(id);

      // The first tab still has server A under that id: no token for it
      expect(service.getTokenForUrl(`${serverA}/api/v1/users/me`)).toBeNull();
      expect(service.hasToken()).toBe(false);
      expect(service.hasTokenForConfig(id)).toBe(false);
      expect(second.tokens.getTokenForUrl(`${serverB}/api/v1/users/me`)).toBe(
        'token-b'
      );

      // Signing in to A again there never gives the second tab A's token
      service.setToken('token-a2');
      expect(service.getTokenForUrl(`${serverA}/api/v1/users/me`)).toBe(
        'token-a2'
      );
      expect(
        second.tokens.getTokenForUrl(`${serverB}/api/v1/users/me`)
      ).toBeNull();
    });

    /**
     * Run `write`, calling `read` after each storage change it makes (as
     * another tab could), and return what `read` saw.
     */
    function readAfterEachChange(
      write: () => void,
      read: () => string | null
    ): Array<string | null> {
      const seen: Array<string | null> = [];
      let reading = false;
      const readNow = () => {
        // A read can store an address itself; don't read inside that
        if (reading) return;
        reading = true;
        seen.push(read());
        reading = false;
      };
      const setItem = vi
        .spyOn(localStorage, 'setItem')
        .mockImplementation((key: string, value: string) => {
          mockStorage[key] = value;
          readNow();
        });
      const removeItem = vi
        .spyOn(localStorage, 'removeItem')
        .mockImplementation((key: string) => {
          delete mockStorage[key];
          readNow();
        });
      write();
      setItem.mockRestore();
      removeItem.mockRestore();
      return seen;
    }

    it('never shows a token next to another server while one is written', () => {
      // The tabs disagree about an id: server A in the first, B in the second
      const id = useServer(serverA);
      const second = openSecondTab();
      second.storage.removeConfig(id);
      const b = second.storage.addServerConfig(serverB);
      second.storage.switchToConfig(b.id);
      expect(b.id).toBe(id);
      const urlB = `${serverB}/api/v1/users/me`;
      second.tokens.setToken('token-b');

      // The first tab signs in to A: a tab on B never reads A's token
      const seenOnB = readAfterEachChange(
        () => service.setToken('token-a'),
        () => second.tokens.getTokenForUrl(urlB)
      );
      expect(seenOnB.length).toBeGreaterThan(0);
      expect(seenOnB).not.toContain('token-a');

      // The second tab signs in to B again: A's token is never read as B's
      const seenOnBAgain = readAfterEachChange(
        () => second.tokens.setToken('token-b2'),
        () => second.tokens.getTokenForUrl(urlB)
      );
      expect(seenOnBAgain).not.toContain('token-a');
      expect(seenOnBAgain.at(-1)).toBe('token-b2');
    });
  });
});
