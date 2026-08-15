import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@themes/theme.service';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import type { BackgroundSetting } from '../../models/element-appearance';
import { StorageContextService } from '../core/storage-context.service';
import { LocalStorageService } from '../local/local-storage.service';
import { AppearanceService } from './appearance.service';

describe('AppearanceService', () => {
  let service: AppearanceService;
  let themeSubject: BehaviorSubject<'light-theme' | 'dark-theme' | 'system'>;
  let localStorageService: LocalStorageService;
  let httpMock: HttpTestingController;

  const makeMatchMedia = (matches: boolean): MediaQueryList => ({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  beforeEach(() => {
    themeSubject = new BehaviorSubject<'light-theme' | 'dark-theme' | 'system'>(
      'light-theme'
    );

    localStorageService = {
      getMediaUrl: vi.fn(),
      saveMedia: vi.fn(),
    } as unknown as LocalStorageService;

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AppearanceService,
        {
          provide: ThemeService,
          useValue: {
            getCurrentTheme: () => themeSubject.asObservable(),
            isDarkMode: () => themeSubject.value === 'dark-theme',
          },
        },
        { provide: LocalStorageService, useValue: localStorageService },
        {
          provide: StorageContextService,
          useValue: { getApiBaseUrl: () => 'http://test.local' },
        },
      ],
    });

    service = TestBed.inject(AppearanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should resolve a solid colour in auto mode', () => {
    // Default theme is light, so an auto colour is lightened. Default
    // intensity 25 maps through a power curve to 0.0625.
    const result = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000' },
      'menu'
    );
    expect(result).toEqual({ type: 'color', background: '#ff1010' });
  });

  it('should lighten an auto colour in light theme', () => {
    themeSubject.next('light-theme');
    const result = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000' },
      'menu'
    );
    expect(result?.type).toBe('color');
    expect(result?.background).toBe('#ff1010');
  });

  it('should darken an auto colour in dark theme', () => {
    themeSubject.next('dark-theme');
    const result = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000' },
      'menu'
    );
    expect(result?.type).toBe('color');
    expect(result?.background).toBe('#ef0000');
  });

  it('should honour the auto intensity slider', () => {
    themeSubject.next('light-theme');
    // Intensity 50 => 0.5^2 = 0.25 lighten.
    const half = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000', intensity: 50 },
      'menu'
    );
    expect(half?.background).toBe('#ff4040');
    // Intensity 100 => 1.0 lighten (white).
    const full = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000', intensity: 100 },
      'menu'
    );
    expect(full?.background).toBe('#ffffff');
    // Intensity 0 => unchanged.
    const none = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000', intensity: 0 },
      'menu'
    );
    expect(none?.background).toBe('#ff0000');
  });

  it('should resolve a manual gradient unchanged', () => {
    const result = service.resolveRegion(
      {
        type: 'gradient',
        mode: 'manual',
        light: 'linear-gradient(#fff, #000)',
        dark: 'linear-gradient(#000, #fff)',
      },
      'content'
    );
    expect(result).toEqual({
      type: 'gradient',
      background: 'linear-gradient(#fff, #000)',
    });
  });

  it('should lighten an auto gradient in light theme', () => {
    themeSubject.next('light-theme');
    const result = service.resolveRegion(
      {
        type: 'gradient',
        mode: 'auto',
        value: 'linear-gradient(#ff0000, #0000ff)',
      },
      'content'
    );
    expect(result?.background).toBe('linear-gradient(#ff1010, #1010ff)');
  });

  it('should darken an auto gradient in dark theme', () => {
    themeSubject.next('dark-theme');
    const result = service.resolveRegion(
      {
        type: 'gradient',
        mode: 'auto',
        value: 'linear-gradient(#ff0000, #0000ff)',
      },
      'content'
    );
    expect(result?.background).toBe('linear-gradient(#ef0000, #0000ef)');
  });

  it('should return null for empty setting', () => {
    expect(service.resolveRegion(undefined, 'menu')).toBeNull();
    expect(
      service.resolveRegion({ type: 'color', mode: 'auto' }, 'menu')
    ).toBeNull();
  });

  describe('manual mode', () => {
    it('should pick the light value when in light theme', () => {
      themeSubject.next('light-theme');
      const setting: BackgroundSetting = {
        type: 'color',
        mode: 'manual',
        light: '#ffffff',
        dark: '#000000',
      };
      expect(service.resolveRegion(setting, 'menu')?.background).toBe(
        '#ffffff'
      );
    });

    it('should pick the dark value when in dark theme', () => {
      themeSubject.next('dark-theme');
      const setting: BackgroundSetting = {
        type: 'color',
        mode: 'manual',
        light: '#ffffff',
        dark: '#000000',
      };
      expect(service.resolveRegion(setting, 'menu')?.background).toBe(
        '#000000'
      );
    });
  });

  describe('auto image mode', () => {
    it('should add a light overlay in light theme', () => {
      themeSubject.next('light-theme');
      const result = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png' },
        'menu'
      );
      expect(result).toEqual({
        type: 'image',
        background: "url('media://bg.png')",
        overlay: 'light',
        overlayAlpha: 0.2,
      });
    });

    it('should add a dark overlay in dark theme', () => {
      themeSubject.next('dark-theme');
      const result = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png' },
        'content'
      );
      expect(result).toEqual({
        type: 'image',
        background: "url('media://bg.png')",
        overlay: 'dark',
        overlayAlpha: 0.25,
      });
    });

    it('should scale the overlay alpha with intensity', () => {
      themeSubject.next('dark-theme');
      const low = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png', intensity: 0 },
        'menu'
      );
      const mid = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png', intensity: 25 },
        'menu'
      );
      const high = service.resolveRegion(
        {
          type: 'image',
          mode: 'auto',
          value: 'media://bg.png',
          intensity: 100,
        },
        'menu'
      );
      expect(low?.overlayAlpha).toBe(0);
      expect(mid?.overlayAlpha).toBe(0.25);
      // Capped so it never fully obscures the image.
      expect(high?.overlayAlpha).toBe(0.6);
    });
  });

  describe('manual image mode', () => {
    it('should resolve the theme-specific image without an overlay', () => {
      themeSubject.next('light-theme');
      const result = service.resolveRegion(
        { type: 'image', mode: 'manual', light: 'light.png', dark: 'dark.png' },
        'menu'
      );
      expect(result).toEqual({
        type: 'image',
        background: "url('light.png')",
      });
    });
  });

  describe('system theme', () => {
    it('should resolve dark mode from the system preference when theme is system', async () => {
      const darkMatchMedia = vi.fn().mockReturnValue(makeMatchMedia(true));
      vi.stubGlobal('matchMedia', darkMatchMedia);

      themeSubject.next('system');
      // The isDarkMode signal updates on the next microtask.
      await Promise.resolve();
      await Promise.resolve();

      const result = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png' },
        'menu'
      );
      expect(result?.overlay).toBe('dark');
      expect(darkMatchMedia).toHaveBeenCalledWith(
        '(prefers-color-scheme: dark)'
      );
    });

    it('should not throw when matchMedia is unavailable', async () => {
      vi.stubGlobal('matchMedia', undefined);

      themeSubject.next('system');
      await Promise.resolve();
      await Promise.resolve();

      const result = service.resolveRegion(
        { type: 'image', mode: 'auto', value: 'media://bg.png' },
        'menu'
      );
      expect(result?.overlay).toBe('light');
    });
  });

  describe('resolveImageReference', () => {
    it('should return non-media URLs with a safe scheme unchanged', async () => {
      expect(
        await service.resolveImageReference('https://x/y.png', 'u', 's')
      ).toBe('https://x/y.png');
      expect(await service.resolveImageReference('blob:abc', 'u', 's')).toBe(
        'blob:abc'
      );
      expect(
        await service.resolveImageReference('unsafe://x', 'u', 's')
      ).toBeNull();
    });

    it('should return the cached blob URL for a media reference', async () => {
      vi.mocked(localStorageService.getMediaUrl).mockResolvedValue('blob:1');
      expect(
        await service.resolveImageReference('media://bg.png', 'u', 's')
      ).toBe('blob:1');
      expect(localStorageService.saveMedia).not.toHaveBeenCalled();
    });

    it('should download and cache media on a cache miss', async () => {
      vi.mocked(localStorageService.getMediaUrl)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('blob:2');
      vi.mocked(localStorageService.saveMedia).mockResolvedValue(undefined);

      const promise = service.resolveImageReference(
        'media://bg.png',
        'user',
        'slug'
      );
      // Let the awaited cache lookup resolve so the HTTP request fires.
      await Promise.resolve();
      const req = httpMock.expectOne(
        'http://test.local/api/v1/media/user/slug/bg.png'
      );
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['x'], { type: 'image/png' }));

      await expect(promise).resolves.toBe('blob:2');
      expect(localStorageService.saveMedia).toHaveBeenCalledWith(
        'user/slug',
        'bg',
        expect.any(Blob),
        'bg.png'
      );
      httpMock.verify();
    });

    it('should return null when the download fails', async () => {
      vi.mocked(localStorageService.getMediaUrl).mockResolvedValue(null);
      const promise = service.resolveImageReference(
        'media://bg.png',
        'user',
        'slug'
      );
      await Promise.resolve();
      httpMock
        .expectOne('http://test.local/api/v1/media/user/slug/bg.png')
        .error(new ErrorEvent('boom'));
      await expect(promise).resolves.toBeNull();
      httpMock.verify();
    });
  });
});
