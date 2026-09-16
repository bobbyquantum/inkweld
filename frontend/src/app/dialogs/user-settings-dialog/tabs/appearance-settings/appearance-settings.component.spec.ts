import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BackgroundService } from '@services/core/background.service';
import { SettingsService } from '@services/core/settings.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
import { AppearanceSettingsComponent } from './appearance-settings.component';

describe('AppearanceSettingsComponent', () => {
  let component: AppearanceSettingsComponent;
  let fixture: ComponentFixture<AppearanceSettingsComponent>;
  let settingsService: SettingsService;
  let localStorageMock: Record<string, string>;

  beforeEach(async () => {
    localStorageMock = {};

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] || null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
        clear: () => {
          localStorageMock = {};
        },
      },
      writable: true,
    });

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AppearanceSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        SettingsService,
        {
          provide: StorageContextService,
          useValue: {
            prefixKey: (key: string) => key,
            prefixDbName: (key: string) => key,
            prefixDocumentId: (key: string) => key,
            getPrefix: () => 'local:',
            getPrefixForConfig: () => 'local:',
            getActiveConfig: () => null,
          },
        },
        // The background picker is a child of this tab; disabled, it renders
        // nothing, which keeps these tests to the density control.
        {
          provide: BackgroundService,
          useValue: {
            userBackgroundEnabled: signal(false),
            userBackgroundUploadEnabled: signal(false),
            hasUpload: signal(false),
            preference: signal({ kind: 'default' }),
            refresh: vi.fn().mockResolvedValue(undefined),
            setPreference: vi.fn().mockResolvedValue(undefined),
            userBackgroundUrl: vi.fn().mockReturnValue(''),
          },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppearanceSettingsComponent);
    component = fixture.componentInstance;
    settingsService = TestBed.inject(SettingsService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('density', () => {
    it('should report compact when the setting is unset, matching the default', () => {
      expect(settingsService.denseLayout()).toBe(true);
      expect(component.density).toBe('compact');
    });

    it('should reflect the stored value', () => {
      settingsService.setDenseLayout(false);
      expect(component.density).toBe('comfortable');

      settingsService.setDenseLayout(true);
      expect(component.density).toBe('compact');
    });

    it('should persist and update the signal when changed', () => {
      component.density = 'comfortable';
      expect(settingsService.denseLayout()).toBe(false);
      expect(JSON.parse(localStorageMock['userSettings']).denseLayout).toBe(
        false
      );

      component.density = 'compact';
      expect(settingsService.denseLayout()).toBe(true);
      expect(JSON.parse(localStorageMock['userSettings']).denseLayout).toBe(
        true
      );
    });

    it('should treat anything but "compact" as comfortable', () => {
      settingsService.setDenseLayout(true);
      // @ts-expect-error Testing an unknown value
      component.density = 'nonsense';
      expect(settingsService.denseLayout()).toBe(false);
    });
  });

  describe('previews', () => {
    it('should offer exactly the two density options', () => {
      expect(component['densityOptions'].map(o => o.value)).toEqual([
        'comfortable',
        'compact',
      ]);
    });

    it('should fit more rows into the compact preview than the comfortable one', () => {
      const [comfortable, compact] = component['densityOptions'];
      expect(compact.preview.rows.length).toBeGreaterThan(
        comfortable.preview.rows.length
      );
      expect(compact.preview.barHeight).toBeLessThan(
        comfortable.preview.barHeight
      );
    });

    it('should keep every preview row inside the viewBox', () => {
      for (const option of component['densityOptions']) {
        for (const y of option.preview.rows) {
          expect(y).toBeGreaterThanOrEqual(option.preview.barHeight);
          expect(y + component['rowHeight']).toBeLessThanOrEqual(
            component['previewHeight']
          );
        }
      }
    });
  });

  it('should render a card per density option', async () => {
    await fixture.whenStable();
    const cards = fixture.nativeElement.querySelectorAll(
      '[data-testid="density-comfortable"], [data-testid="density-compact"]'
    );
    expect(cards).toHaveLength(2);
    // Each card carries its own miniature.
    expect(
      fixture.nativeElement.querySelectorAll('svg.density-preview')
    ).toHaveLength(2);
  });
});
