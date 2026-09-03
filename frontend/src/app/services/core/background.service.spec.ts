import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppearanceConfig, BackgroundService } from './background.service';
import { LoggerService } from './logger.service';
import { SetupService } from './setup.service';
import { StorageContextService } from './storage-context.service';

const SERVER = 'http://inkweld.example.com';
const CONFIG_URL = `${SERVER}/api/v1/appearance/config`;
const PREFERENCE_URL = `${SERVER}/api/v1/appearance/preference`;
const USER_BACKGROUND_URL = `${SERVER}/api/v1/appearance/user-background`;
const BUNDLED = "url('/home_background.png')";

/**
 * Let a settled `firstValueFrom` promise run its continuation, so the next
 * request in a chained sequence has actually been issued before we assert on it.
 */
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function makeConfig(
  overrides: Partial<AppearanceConfig> = {}
): AppearanceConfig {
  return {
    login: { source: 'default', value: null },
    home: { source: 'default', value: null },
    overlayOpacity: null,
    blur: 0,
    userBackgroundEnabled: false,
    userBackgroundUploadEnabled: false,
    ...overrides,
  };
}

describe('BackgroundService', () => {
  let service: BackgroundService;
  let http: HttpTestingController;
  let mode: 'server' | 'local';
  let store: Record<string, string>;
  const originalLocalStorage = window.localStorage;

  /** The CSS custom properties the service writes to the root element. */
  function cssVar(name: string): string {
    return document.documentElement.style.getPropertyValue(name);
  }

  beforeEach(() => {
    mode = 'server';
    store = {};

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
      },
      writable: true,
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        BackgroundService,
        {
          provide: SetupService,
          useValue: {
            getServerUrl: () => SERVER,
            getMode: () => mode,
          },
        },
        {
          provide: StorageContextService,
          useValue: { prefixKey: (key: string) => key },
        },
        {
          provide: LoggerService,
          useValue: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
        },
      ],
    });

    service = TestBed.inject(BackgroundService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    // Leave the root element as we found it so specs cannot leak into each other.
    for (const name of [
      '--app-bg-image',
      '--app-bg-color',
      '--app-bg-filter',
      '--app-bg-blur-fn',
      '--app-bg-scrim-override',
    ]) {
      document.documentElement.style.removeProperty(name);
    }
  });

  describe('admin-configured backgrounds', () => {
    it('applies an uploaded asset with the server prefix', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: {
            source: 'asset',
            value: '/api/v1/appearance/background/login?v=abc',
          },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(
        `url("${SERVER}/api/v1/appearance/background/login?v=abc")`
      );
    });

    it('accepts its own asset over a plain-http server base', async () => {
      // Self-hosted and local instances run over http; the https-only rule is
      // for external hosts, not for paths the server itself handed us.
      const refresh = service.refresh({ authenticated: true });
      http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(
        makeConfig({
          userBackgroundEnabled: true,
          userBackgroundUploadEnabled: true,
        })
      );
      await tick();
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'upload' }, hasUpload: true });
      await refresh;

      service.setSurface('app');
      expect(cssVar('--app-bg-image')).toBe(`url("${USER_BACKGROUND_URL}")`);
    });

    it('applies an external URL as-is', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: { source: 'url', value: 'https://cdn.example.com/bg.jpg' },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/bg.jpg")'
      );
    });

    it('refuses a URL that could break out of the url() token', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: {
            source: 'url',
            // A value the backend would have rejected; the client is the
            // second line of defence.
            value: 'https://x.test/a.png") ; background: url("javascript:0',
          },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('refuses plain http (mixed content on the https app)', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: { source: 'url', value: 'http://cdn.example.com/bg.jpg' },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('refuses a non-http scheme', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: { source: 'url', value: 'data:image/png;base64,AAA' },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('keeps the stylesheet defaults when the config call fails', async () => {
      const refresh = service.refresh();
      http
        .expectOne(CONFIG_URL)
        .error(new ProgressEvent('error'), { status: 500, statusText: 'Boom' });
      await refresh;

      expect(service.appearance()).toBeNull();
      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('resolves each surface independently', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: { source: 'url', value: 'https://cdn.example.com/login.jpg' },
          home: { source: 'url', value: 'https://cdn.example.com/home.jpg' },
        })
      );
      await refresh;

      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/login.jpg")'
      );

      service.setSurface('app');
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'default' }, hasUpload: false });
      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/home.jpg")'
      );
    });
  });

  describe('surface switching', () => {
    it('loads the preference on entering the app surface, once', async () => {
      const refresh = service.refresh();
      http
        .expectOne(CONFIG_URL)
        .flush(makeConfig({ userBackgroundEnabled: true }));
      await refresh;

      service.setSurface('app');
      http.expectOne({ method: 'GET', url: PREFERENCE_URL }).flush({
        background: { kind: 'preset', presetId: 'dusk' },
        hasUpload: false,
      });
      await tick();
      expect(cssVar('--app-bg-image')).toContain('linear-gradient');

      // Bouncing through the same surface must not refetch.
      service.setSurface('app');
      http.expectNone({ method: 'GET', url: PREFERENCE_URL });
    });

    it('forgets the preference on returning to the login surface', async () => {
      const refresh = service.refresh();
      http
        .expectOne(CONFIG_URL)
        .flush(makeConfig({ userBackgroundEnabled: true }));
      await refresh;

      service.setSurface('app');
      http.expectOne({ method: 'GET', url: PREFERENCE_URL }).flush({
        background: { kind: 'preset', presetId: 'dusk' },
        hasUpload: true,
      });
      await tick();

      // Signing out: the next person to sign in may be someone else.
      service.setSurface('login');
      expect(service.preference()).toEqual({ kind: 'default' });
      expect(service.hasUpload()).toBe(false);
      expect(cssVar('--app-bg-image')).toBe(BUNDLED);

      service.setSurface('app');
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'default' }, hasUpload: false });
    });

    it('replays the cached app-surface background while the config is in flight', () => {
      store['appearance.background.app'] = JSON.stringify({
        image: 'url("https://cdn.example.com/home.jpg")',
        color: 'transparent',
        blur: 0,
        overlayOpacity: null,
      });

      service.initialize();
      // Config request is pending; auth resolves meanwhile.
      service.setSurface('app');
      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/home.jpg")'
      );

      http.expectOne(CONFIG_URL).flush(makeConfig());
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'default' }, hasUpload: false });
    });
  });

  describe('treatment', () => {
    it('sets both blur spellings when a blur is configured', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(makeConfig({ blur: 12 }));
      await refresh;

      expect(cssVar('--app-bg-filter')).toBe('blur(12px)');
      expect(cssVar('--app-bg-blur-fn')).toBe('blur(12px)');
    });

    it('removes the append-form variable when blur is off', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(makeConfig({ blur: 0 }));
      await refresh;

      expect(cssVar('--app-bg-filter')).toBe('none');
      // Left unset rather than blank: `var(--app-bg-blur-fn, )` must resolve to
      // nothing, not to an empty (invalid) filter list.
      expect(cssVar('--app-bg-blur-fn')).toBe('');
    });

    it('sets the scrim override only when an opacity is configured', async () => {
      const first = service.refresh();
      http.expectOne(CONFIG_URL).flush(makeConfig({ overlayOpacity: 0.8 }));
      await first;
      expect(cssVar('--app-bg-scrim-override')).toBe('0.8');

      const second = service.refresh();
      http.expectOne(CONFIG_URL).flush(makeConfig({ overlayOpacity: null }));
      await second;
      expect(cssVar('--app-bg-scrim-override')).toBe('');
    });
  });

  describe('user preference', () => {
    async function loadWith(config: AppearanceConfig): Promise<void> {
      const refresh = service.refresh({ authenticated: true });
      http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(config);
      await tick();
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'default' }, hasUpload: false });
      await refresh;
    }

    it('is ignored on the login surface', async () => {
      await loadWith(
        makeConfig({
          userBackgroundEnabled: true,
          login: { source: 'url', value: 'https://cdn.example.com/login.jpg' },
        })
      );

      const setPreference = service.setPreference({
        kind: 'preset',
        presetId: 'midnight',
      });
      http.expectOne({ method: 'PUT', url: PREFERENCE_URL }).flush({
        kind: 'preset',
        presetId: 'midnight',
      });
      await setPreference;

      // Still on the login surface, so the admin's image wins.
      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/login.jpg")'
      );
    });

    it('applies a preset on the app surface', async () => {
      await loadWith(makeConfig({ userBackgroundEnabled: true }));
      service.setSurface('app');

      const setPreference = service.setPreference({
        kind: 'preset',
        presetId: 'midnight',
      });
      http
        .expectOne({ method: 'PUT', url: PREFERENCE_URL })
        .flush({ kind: 'preset', presetId: 'midnight' });
      await setPreference;

      expect(cssVar('--app-bg-image')).toContain('linear-gradient');
    });

    it('ignores a preference while the admin has personalisation off', async () => {
      await loadWith(
        makeConfig({
          userBackgroundEnabled: false,
          home: { source: 'url', value: 'https://cdn.example.com/home.jpg' },
        })
      );
      service.setSurface('app');

      const setPreference = service.setPreference({
        kind: 'preset',
        presetId: 'midnight',
      });
      http
        .expectOne({ method: 'PUT', url: PREFERENCE_URL })
        .flush({ kind: 'preset', presetId: 'midnight' });
      await setPreference;

      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/home.jpg")'
      );
    });

    it('falls back to the admin default for an unknown preset id', async () => {
      await loadWith(makeConfig({ userBackgroundEnabled: true }));
      service.setSurface('app');

      const setPreference = service.setPreference({
        kind: 'preset',
        presetId: 'not-a-real-preset',
      });
      http
        .expectOne({ method: 'PUT', url: PREFERENCE_URL })
        .flush({ kind: 'preset', presetId: 'not-a-real-preset' });
      await setPreference;

      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('needs the upload flag as well as a stored image to use an upload', async () => {
      const refresh = service.refresh({ authenticated: true });
      http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(
        makeConfig({
          userBackgroundEnabled: true,
          userBackgroundUploadEnabled: false,
        })
      );
      await tick();
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'upload' }, hasUpload: true });
      await refresh;

      service.setSurface('app');
      expect(cssVar('--app-bg-image')).toBe(BUNDLED);
    });

    it('uses the upload when both the flag and the image are present', async () => {
      const refresh = service.refresh({ authenticated: true });
      http.expectOne({ method: 'GET', url: CONFIG_URL }).flush(
        makeConfig({
          userBackgroundEnabled: true,
          userBackgroundUploadEnabled: true,
        })
      );
      await tick();
      http
        .expectOne({ method: 'GET', url: PREFERENCE_URL })
        .flush({ background: { kind: 'upload' }, hasUpload: true });
      await refresh;

      service.setSurface('app');
      expect(cssVar('--app-bg-image')).toBe(`url("${USER_BACKGROUND_URL}")`);
    });
  });

  describe('uploads', () => {
    it('cache-busts the image URL after an upload', async () => {
      const upload = service.uploadUserBackground(new Blob(['x']), 'bg.png');
      http
        .expectOne({ method: 'POST', url: USER_BACKGROUND_URL })
        .flush({ message: 'ok' });
      await upload;

      expect(service.hasUpload()).toBe(true);
      expect(service.preference()).toEqual({ kind: 'upload' });
      expect(service.userBackgroundUrl()).toBe(`${USER_BACKGROUND_URL}?v=1`);
    });

    it('reverts to the default after deleting the image', async () => {
      const remove = service.deleteUserBackground();
      http
        .expectOne({ method: 'DELETE', url: USER_BACKGROUND_URL })
        .flush({ message: 'ok' });
      await remove;

      expect(service.hasUpload()).toBe(false);
      expect(service.preference()).toEqual({ kind: 'default' });
    });
  });

  describe('local mode', () => {
    beforeEach(() => {
      mode = 'local';
    });

    it('never calls the API and allows presets but not uploads', async () => {
      await service.refresh();

      // http.verify() in afterEach asserts no request was made.
      expect(service.userBackgroundEnabled()).toBe(true);
      expect(service.userBackgroundUploadEnabled()).toBe(false);
    });

    it('applies a preset without a server round-trip', async () => {
      await service.refresh();
      service.setSurface('app');
      await service.setPreference({ kind: 'preset', presetId: 'forest' });

      expect(cssVar('--app-bg-image')).toContain('linear-gradient');
    });
  });

  describe('first-paint cache', () => {
    it('writes what it resolved so the next boot can replay it', async () => {
      const refresh = service.refresh();
      http.expectOne(CONFIG_URL).flush(
        makeConfig({
          login: { source: 'url', value: 'https://cdn.example.com/bg.jpg' },
          blur: 8,
          overlayOpacity: 0.6,
        })
      );
      await refresh;

      expect(JSON.parse(store['appearance.background.login'])).toEqual({
        image: 'url("https://cdn.example.com/bg.jpg")',
        color: 'transparent',
        blur: 8,
        overlayOpacity: 0.6,
      });
    });

    it('replays a cached background synchronously, before the config arrives', () => {
      store['appearance.background.login'] = JSON.stringify({
        image: 'url("https://cdn.example.com/bg.jpg")',
        color: 'transparent',
        blur: 8,
        overlayOpacity: 0.6,
      });

      service.initialize();

      // Asserted before flushing: this is the whole point of the cache.
      expect(cssVar('--app-bg-image')).toBe(
        'url("https://cdn.example.com/bg.jpg")'
      );
      expect(cssVar('--app-bg-filter')).toBe('blur(8px)');
      expect(cssVar('--app-bg-scrim-override')).toBe('0.6');

      http.expectOne(CONFIG_URL).flush(makeConfig());
    });

    it('discards a tampered cache entry', () => {
      store['appearance.background.login'] = JSON.stringify({
        image: 'url("javascript:alert(1)")',
        color: 'transparent',
        blur: 0,
        overlayOpacity: null,
      });

      service.initialize();
      http.expectOne(CONFIG_URL).flush(makeConfig());

      expect(cssVar('--app-bg-image')).not.toContain('javascript');
    });

    it('discards a cache entry with an unrecognised colour', () => {
      store['appearance.background.login'] = JSON.stringify({
        image: 'none',
        color: 'red; content: "x"',
        blur: 0,
        overlayOpacity: null,
      });

      service.initialize();
      http.expectOne(CONFIG_URL).flush(makeConfig());

      expect(cssVar('--app-bg-color')).not.toContain('content');
    });

    it('does not replay an app-surface entry on the login surface', () => {
      // A user who picked a gradient, then signed out: the login page must not
      // flash their gradient before the config arrives.
      store['appearance.background.app'] = JSON.stringify({
        image: 'linear-gradient(160deg, #0b1021 0%, #1b2a4a 55%, #24405f 100%)',
        color: '#0b1021',
        blur: 0,
        overlayOpacity: null,
      });

      service.initialize();
      expect(cssVar('--app-bg-image')).toBe('');

      http.expectOne(CONFIG_URL).flush(makeConfig());
    });

    it('restores a cached preference so the picker shows the right tile', () => {
      store['appearance.background-preference'] = JSON.stringify({
        kind: 'preset',
        presetId: 'slate',
      });

      service.initialize();
      http.expectOne(CONFIG_URL).flush(makeConfig());

      expect(service.preference()).toEqual({
        kind: 'preset',
        presetId: 'slate',
      });
    });

    it('ignores a cached preference of an unknown shape', () => {
      store['appearance.background-preference'] = JSON.stringify({
        kind: 'something-else',
      });

      service.initialize();
      http.expectOne(CONFIG_URL).flush(makeConfig());

      expect(service.preference()).toEqual({ kind: 'default' });
    });
  });
});
