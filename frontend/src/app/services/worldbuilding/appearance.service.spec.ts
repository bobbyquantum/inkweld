import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@themes/theme.service';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import type { BackgroundSetting } from '../../models/element-appearance';
import { AppearanceService } from './appearance.service';

describe('AppearanceService', () => {
  let service: AppearanceService;
  let themeSubject: BehaviorSubject<'light-theme' | 'dark-theme' | 'system'>;

  beforeEach(() => {
    themeSubject = new BehaviorSubject<'light-theme' | 'dark-theme' | 'system'>(
      'light-theme'
    );

    // Default system dark mode off. Use stubGlobal so the global afterEach
    // (vi.unstubAllGlobals) restores the full matchMedia mock for other specs.
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));

    TestBed.configureTestingModule({
      providers: [
        AppearanceService,
        {
          provide: ThemeService,
          useValue: {
            getCurrentTheme: () => themeSubject.asObservable(),
            isDarkMode: () => themeSubject.value === 'dark-theme',
          },
        },
      ],
    });

    service = TestBed.inject(AppearanceService);
  });

  it('should resolve a solid colour in auto mode', () => {
    const result = service.resolveRegion(
      { type: 'color', mode: 'auto', value: '#ff0000' },
      'menu'
    );
    expect(result).toEqual({ type: 'color', background: '#ff0000' });
  });

  it('should resolve a gradient unchanged', () => {
    const result = service.resolveRegion(
      {
        type: 'gradient',
        mode: 'auto',
        value: 'linear-gradient(#fff, #000)',
      },
      'content'
    );
    expect(result).toEqual({
      type: 'gradient',
      background: 'linear-gradient(#fff, #000)',
    });
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
      });
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
      const darkMatchMedia = vi.fn().mockReturnValue({ matches: true });
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
  });
});
