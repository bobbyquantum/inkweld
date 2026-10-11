import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloudSyncConfigService } from '@services/cloud-sync/cloud-sync-config.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import {
  APP_MODE_POLICY_STORAGE_KEY,
  AppModePolicyService,
  resolveHomeServerUrl,
} from './app-mode-policy.service';
import { LoggerService } from './logger.service';

/** A document whose <base href> says where it was served from */
function makeDocument(base: string, ingress = false): Document {
  const doc = document.implementation.createHTMLDocument('test');
  const baseEl = doc.createElement('base');
  baseEl.setAttribute('href', base);
  doc.head.appendChild(baseEl);
  if (ingress) {
    const meta = doc.createElement('meta');
    meta.setAttribute('name', 'inkweld-ingress');
    doc.head.appendChild(meta);
  }
  return doc;
}

describe('resolveHomeServerUrl', () => {
  it('uses the build apiUrl, without a trailing slash', () => {
    expect(
      resolveHomeServerUrl(
        { apiUrl: 'https://api.inkweld.app/' },
        makeDocument('https://inkweld.app/')
      )
    ).toBe('https://api.inkweld.app');
  });

  it("uses the page's own origin when the build has no apiUrl", () => {
    expect(
      resolveHomeServerUrl(
        { apiUrl: '' },
        makeDocument('https://writers.example.com/')
      )
    ).toBe('https://writers.example.com');
  });

  it('keeps the path prefix the page is served under', () => {
    expect(
      resolveHomeServerUrl(
        { apiUrl: '' },
        makeDocument('https://example.com/inkweld/')
      )
    ).toBe('https://example.com/inkweld');
  });

  it('uses the ingress origin under Home Assistant, whatever the build says', () => {
    expect(
      resolveHomeServerUrl(
        { apiUrl: 'http://localhost:8333' },
        makeDocument('http://ha.local:8123/api/hassio_ingress/tok/', true)
      )
    ).toBe('http://ha.local:8123/api/hassio_ingress/tok');
  });

  it('has no home server in Electron', () => {
    expect(
      resolveHomeServerUrl(
        { apiUrl: 'http://localhost:8333', electron: true },
        makeDocument('https://app.local/')
      )
    ).toBeNull();
  });

  it('has no home server on a non-web page without an apiUrl', () => {
    expect(
      resolveHomeServerUrl({ apiUrl: '' }, makeDocument('file:///app/'))
    ).toBeNull();
  });
});

describe('AppModePolicyService', () => {
  const home = environment.apiUrl.replace(/\/+$/, '');
  const featuresUrl = `${home}/api/v1/config/features`;
  let cloudAvailable: boolean;
  let http: HttpTestingController;

  /** Build the service; `fetch` asks for the policy as setup would */
  function create(fetch = true): AppModePolicyService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: CloudSyncConfigService,
          useValue: { isCloudSyncAvailable: () => cloudAvailable },
        },
        {
          provide: LoggerService,
          useValue: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(AppModePolicyService);
    if (fetch) void service.ready();
    return service;
  }

  async function serve(
    service: AppModePolicyService,
    body: object
  ): Promise<void> {
    http.expectOne(featuresUrl).flush(body);
    await service.ready();
  }

  beforeEach(() => {
    cloudAvailable = true;
    localStorage.removeItem(APP_MODE_POLICY_STORAGE_KEY);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(APP_MODE_POLICY_STORAGE_KEY);
  });

  it('asks the home server, not the active profile', () => {
    const service = create();
    expect(service.homeServerUrl).toBe(home);
    http.expectOne(featuresUrl).flush({ appMode: 'BOTH' });
  });

  it('does not contact a server until asked', async () => {
    const service = create(false);
    http.expectNone(featuresUrl);
    expect(service.isLoaded()).toBe(false);

    // Until someone starts adding a profile
    const loaded = service.ready();
    expect(service.ready()).toBe(loaded);
    http.expectOne(featuresUrl).flush({ appMode: 'ONLINE' });
    await loaded;

    expect(service.appMode()).toBe('ONLINE');
  });

  it('uses the cached mode before fetching', () => {
    localStorage.setItem(
      APP_MODE_POLICY_STORAGE_KEY,
      JSON.stringify({ serverUrl: home, appMode: 'ONLINE' })
    );
    const service = create(false);

    http.expectNone(featuresUrl);
    expect(service.canAddBrowserProfiles()).toBe(false);
  });

  it('allows everything until told otherwise', () => {
    const service = create();
    expect(service.appMode()).toBe('BOTH');
    expect(service.isLoaded()).toBe(false);
    expect(service.canAddBrowserProfiles()).toBe(true);
    expect(service.canAddCloudProfiles()).toBe(true);
    expect(service.canAddServerProfiles()).toBe(true);
    expect(service.restrictionMessageKey()).toBeNull();
    http.expectOne(featuresUrl).flush({});
  });

  it('ONLINE forbids Browser and Cloud Sync profiles', async () => {
    const service = create();
    await serve(service, { appMode: 'ONLINE' });

    expect(service.isLoaded()).toBe(true);
    expect(service.canAddBrowserProfiles()).toBe(false);
    expect(service.canAddCloudProfiles()).toBe(false);
    expect(service.canAddServerProfiles()).toBe(true);
    expect(service.restrictionMessageKey()).toBe('appModePolicy.serverOnly');
    expect(service.upgradeTargets('local')).toEqual(['server']);
    expect(service.upgradeTargets('cloud')).toEqual(['server']);
  });

  it('LOCAL forbids server profiles', async () => {
    const service = create();
    await serve(service, { appMode: 'LOCAL' });

    expect(service.canAddBrowserProfiles()).toBe(true);
    expect(service.canAddCloudProfiles()).toBe(true);
    expect(service.canAddServerProfiles()).toBe(false);
    expect(service.restrictionMessageKey()).toBe('appModePolicy.browserOnly');
    expect(service.upgradeTargets('local')).toEqual(['cloud']);
    expect(service.upgradeTargets('cloud')).toEqual([]);
  });

  it('only offers cloud when the build has a provider', async () => {
    cloudAvailable = false;
    const service = create();
    await serve(service, { appMode: 'BOTH' });

    expect(service.canAddCloudProfiles()).toBe(false);
    expect(service.upgradeTargets('local')).toEqual(['server']);
    expect(service.upgradeTargets('server')).toEqual([]);
    expect(service.upgradeTargets(null)).toEqual([]);
  });

  it('ignores an unknown appMode', async () => {
    const service = create();
    await serve(service, { appMode: 'SOMETIMES' });

    expect(service.appMode()).toBe('BOTH');
    expect(localStorage.getItem(APP_MODE_POLICY_STORAGE_KEY)).toBeNull();
  });

  it('passes on the default server name', async () => {
    const service = create();
    await serve(service, {
      appMode: 'BOTH',
      defaultServerName: ' https://writers.example.com ',
    });

    expect(service.defaultServerName()).toBe('https://writers.example.com');
  });

  it('ignores a blank default server name', async () => {
    const service = create();
    await serve(service, { appMode: 'BOTH', defaultServerName: '  ' });

    expect(service.defaultServerName()).toBeNull();
  });

  it('remembers the mode for the next visit', async () => {
    const service = create();
    await serve(service, { appMode: 'ONLINE' });

    expect(
      JSON.parse(localStorage.getItem(APP_MODE_POLICY_STORAGE_KEY) ?? '{}')
    ).toEqual({ serverUrl: home, appMode: 'ONLINE' });
  });

  it('keeps an ONLINE site locked while its server is unreachable', async () => {
    localStorage.setItem(
      APP_MODE_POLICY_STORAGE_KEY,
      JSON.stringify({ serverUrl: home, appMode: 'ONLINE' })
    );
    const service = create();
    expect(service.canAddBrowserProfiles()).toBe(false);

    http
      .expectOne(featuresUrl)
      .error(new ProgressEvent('error'), { status: 0 });
    await service.ready();

    expect(service.isLoaded()).toBe(true);
    expect(service.appMode()).toBe('ONLINE');
    expect(service.canAddBrowserProfiles()).toBe(false);
  });

  it('tries again on the next ready() after a failure', async () => {
    const service = create();
    http
      .expectOne(featuresUrl)
      .error(new ProgressEvent('error'), { status: 0 });
    await service.ready();

    const retry = service.ready();
    http.expectOne(featuresUrl).flush({ appMode: 'ONLINE' });
    await retry;

    expect(service.appMode()).toBe('ONLINE');
  });

  it('does not apply a mode cached for another server', () => {
    localStorage.setItem(
      APP_MODE_POLICY_STORAGE_KEY,
      JSON.stringify({
        serverUrl: 'https://elsewhere.example',
        appMode: 'ONLINE',
      })
    );
    const service = create();

    expect(service.appMode()).toBe('BOTH');
    http.expectOne(featuresUrl).flush({ appMode: 'BOTH' });
  });

  it('survives an unreadable cache', () => {
    localStorage.setItem(APP_MODE_POLICY_STORAGE_KEY, '{not json');
    const service = create();

    expect(service.appMode()).toBe('BOTH');
    http.expectOne(featuresUrl).flush({ appMode: 'BOTH' });
  });

  it('lets a newer answer lift a cached restriction', async () => {
    localStorage.setItem(
      APP_MODE_POLICY_STORAGE_KEY,
      JSON.stringify({ serverUrl: home, appMode: 'ONLINE' })
    );
    const service = create();
    await serve(service, { appMode: 'BOTH' });

    expect(service.canAddBrowserProfiles()).toBe(true);
  });
});
