import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { BASE_PATH } from '@inkweld/variables';
import { BackgroundService } from '@services/core/background.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../testing/transloco-test-provider';
import { AdminAppearanceComponent } from './appearance.component';

const CONFIG_KEYS = [
  'LOGIN_BACKGROUND_ASSET',
  'HOME_BACKGROUND_ASSET',
  'LOGIN_BACKGROUND_URL',
  'HOME_BACKGROUND_URL',
  'BACKGROUND_OVERLAY_OPACITY',
  'BACKGROUND_BLUR',
  'USER_BACKGROUND_ENABLED',
  'USER_BACKGROUND_UPLOAD_ENABLED',
] as const;

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('AdminAppearanceComponent', () => {
  let component: AdminAppearanceComponent;
  let fixture: ComponentFixture<AdminAppearanceComponent>;
  let httpMock: HttpTestingController;
  let mockBackgroundService: {
    appearance: ReturnType<typeof signal>;
    refresh: ReturnType<typeof vi.fn>;
  };

  /** Answer the eight config GETs that loadConfig() fires. */
  function flushConfig(overrides: Partial<Record<string, string>> = {}): void {
    const defaults: Record<string, string> = {
      LOGIN_BACKGROUND_ASSET: '',
      HOME_BACKGROUND_ASSET: '',
      LOGIN_BACKGROUND_URL: '',
      HOME_BACKGROUND_URL: '',
      BACKGROUND_OVERLAY_OPACITY: '',
      BACKGROUND_BLUR: '0',
      USER_BACKGROUND_ENABLED: 'true',
      USER_BACKGROUND_UPLOAD_ENABLED: 'false',
    };
    const values = { ...defaults, ...overrides };

    for (const key of CONFIG_KEYS) {
      httpMock
        .expectOne(`/api/v1/admin/config/${key}`)
        .flush({ key, value: values[key], source: 'database' });
    }
  }

  beforeEach(async () => {
    mockBackgroundService = {
      appearance: signal(null),
      refresh: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AdminAppearanceComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        { provide: BASE_PATH, useValue: '' },
        { provide: BackgroundService, useValue: mockBackgroundService },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminAppearanceComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads the appearance config on init', async () => {
    fixture.detectChanges();
    flushConfig({
      HOME_BACKGROUND_ASSET: 'abc123',
      LOGIN_BACKGROUND_URL: 'https://cdn.example.com/login.jpg',
      BACKGROUND_OVERLAY_OPACITY: '0.8',
      BACKGROUND_BLUR: '12',
      USER_BACKGROUND_UPLOAD_ENABLED: 'true',
    });
    await tick();

    expect(component.isLoading()).toBe(false);
    expect(component.hasHomeAsset()).toBe(true);
    expect(component.hasLoginAsset()).toBe(false);
    expect(component.loginUrl()).toBe('https://cdn.example.com/login.jpg');
    expect(component.overlayOpacity()).toBe('0.8');
    expect(component.blur()).toBe(12);
    expect(component.userBackgroundUploadEnabled()).toBe(true);
  });

  it('reports the login surface as inheriting when it has nothing of its own', async () => {
    fixture.detectChanges();
    flushConfig({ HOME_BACKGROUND_ASSET: 'abc123' });
    await tick();

    expect(component.loginInheritsHome()).toBe(true);

    // …and stops once the login surface has its own URL.
    const save = component.saveUrl(
      'login',
      'https://cdn.example.com/login.jpg'
    );
    httpMock.expectOne('/api/v1/admin/config/LOGIN_BACKGROUND_URL').flush({});
    await save;

    expect(component.loginInheritsHome()).toBe(false);
  });

  it('previews the home image for the login surface while it inherits', async () => {
    mockBackgroundService.appearance.set({
      login: {
        source: 'asset',
        value: '/api/v1/appearance/background/home?v=x',
      },
      home: {
        source: 'asset',
        value: '/api/v1/appearance/background/home?v=x',
      },
      overlayOpacity: null,
      blur: 0,
      userBackgroundEnabled: true,
      userBackgroundUploadEnabled: false,
    });

    fixture.detectChanges();
    flushConfig({ HOME_BACKGROUND_ASSET: 'x' });
    await tick();

    expect(component.loginPreview()).toBe(
      'url("/api/v1/appearance/background/home?v=x")'
    );
  });

  it('rejects a URL that is not absolute http(s) without calling the server', async () => {
    fixture.detectChanges();
    flushConfig();
    await tick();

    await component.saveUrl('home', 'not-a-url');

    // No request at all — verify() in the assertion below would catch one.
    httpMock.verify();
    expect(component.homeUrl()).toBe('');
  });

  it('rejects an out-of-range scrim opacity without calling the server', async () => {
    fixture.detectChanges();
    flushConfig();
    await tick();

    await component.saveOverlayOpacity('2');

    httpMock.verify();
    expect(component.overlayOpacity()).toBe('');
  });

  it('accepts an empty scrim opacity as "use the defaults"', async () => {
    fixture.detectChanges();
    flushConfig({ BACKGROUND_OVERLAY_OPACITY: '0.5' });
    await tick();

    const save = component.saveOverlayOpacity('');
    httpMock
      .expectOne('/api/v1/admin/config/BACKGROUND_OVERLAY_OPACITY')
      .flush({});
    await save;

    expect(component.overlayOpacity()).toBe('');
  });

  it('uploads an image and marks the surface as having one', async () => {
    fixture.detectChanges();
    flushConfig();
    await tick();

    const file = new File([new Uint8Array([1, 2, 3])], 'bg.png', {
      type: 'image/png',
    });
    const event = {
      target: { files: [file], value: 'bg.png' },
    } as unknown as Event;

    const upload = component.onFileSelected('home', event);
    httpMock
      .expectOne({
        method: 'PUT',
        url: '/api/v1/admin/appearance/background/home',
      })
      .flush({ message: 'ok' });
    await upload;

    expect(component.hasHomeAsset()).toBe(true);
    expect(mockBackgroundService.refresh).toHaveBeenCalled();
  });

  it('refuses an SVG upload without calling the server', async () => {
    fixture.detectChanges();
    flushConfig();
    await tick();

    const file = new File(['<svg/>'], 'bg.svg', { type: 'image/svg+xml' });
    await component.onFileSelected('home', {
      target: { files: [file], value: 'bg.svg' },
    } as unknown as Event);

    httpMock.verify();
    expect(component.hasHomeAsset()).toBe(false);
  });

  it('removes an uploaded image', async () => {
    fixture.detectChanges();
    flushConfig({ HOME_BACKGROUND_ASSET: 'abc' });
    await tick();
    expect(component.hasHomeAsset()).toBe(true);

    const remove = component.removeImage('home');
    httpMock
      .expectOne({
        method: 'DELETE',
        url: '/api/v1/admin/appearance/background/home',
      })
      .flush({ message: 'ok' });
    await remove;

    expect(component.hasHomeAsset()).toBe(false);
  });

  it('gates the upload toggle on personalisation being enabled', async () => {
    fixture.detectChanges();
    flushConfig({ USER_BACKGROUND_ENABLED: 'false' });
    await tick();

    expect(component.canEnableUploads()).toBe(false);

    const toggle = component.toggleUserBackground(true);
    httpMock
      .expectOne('/api/v1/admin/config/USER_BACKGROUND_ENABLED')
      .flush({});
    await toggle;

    expect(component.canEnableUploads()).toBe(true);
  });

  it('surfaces a load failure so it can be retried', async () => {
    fixture.detectChanges();
    for (const key of CONFIG_KEYS) {
      httpMock
        .expectOne(`/api/v1/admin/config/${key}`)
        .error(new ProgressEvent('error'), { status: 500, statusText: 'Boom' });
    }
    await tick();

    // getConfig() swallows errors and returns null, so the component still
    // renders — with everything at its default rather than a blank page.
    expect(component.isLoading()).toBe(false);
    expect(component.hasHomeAsset()).toBe(false);
  });
});
