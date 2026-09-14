import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SettingsService } from './settings.service';
import { StorageContextService } from './storage-context.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let localStorageMock: { [key: string]: string };
  const originalLocalStorage = window.localStorage;

  /**
   * (Re)create the service against the current `localStorageMock` contents.
   * Defaults are read at construction, so tests that need a pre-populated
   * store must call this *after* seeding `localStorageMock`.
   */
  const createService = (): SettingsService => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
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
      ],
    });
    return TestBed.inject(SettingsService);
  };

  beforeEach(() => {
    localStorageMock = {};

    // Mock localStorage
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

    service = createService();
  });

  afterEach(() => {
    // Restore original localStorage to prevent leaking mock to other tests (isolate: false)
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getSetting', () => {
    it('should return default value when setting does not exist', () => {
      const result = service.getSetting('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('should return stored value when setting exists', () => {
      service.setSetting('test', 'value');
      const result = service.getSetting('test', 'default');
      expect(result).toBe('value');
    });

    it('should return default value when stored value is null', () => {
      service.setSetting('test', null);
      const result = service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle different types of values', () => {
      service.setSetting('number', 42);
      service.setSetting('boolean', true);
      service.setSetting('object', { key: 'value' });

      expect(service.getSetting('number', 0)).toBe(42);
      expect(service.getSetting('boolean', false)).toBe(true);
      expect(service.getSetting('object', {})).toEqual({
        key: 'value',
      });
    });
  });

  describe('setSetting', () => {
    it('should store value in localStorage', () => {
      service.setSetting('test', 'value');
      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings.test).toBe('value');
    });

    it('should preserve existing settings when adding new ones', () => {
      service.setSetting('first', 'one');
      service.setSetting('second', 'two');

      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings).toEqual({
        first: 'one',
        second: 'two',
      });
    });

    it('should update existing setting', () => {
      service.setSetting('test', 'original');
      service.setSetting('test', 'updated');

      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings.test).toBe('updated');
    });
  });

  describe('setShowBreadcrumbs', () => {
    it('defaults the signal to true when nothing is stored', () => {
      expect(service.showBreadcrumbs()).toBe(true);
    });

    it('persists the value and updates the reactive signal', () => {
      service.setShowBreadcrumbs(false);
      expect(service.showBreadcrumbs()).toBe(false);
      expect(JSON.parse(localStorageMock['userSettings']).showBreadcrumbs).toBe(
        false
      );

      service.setShowBreadcrumbs(true);
      expect(service.showBreadcrumbs()).toBe(true);
      expect(JSON.parse(localStorageMock['userSettings']).showBreadcrumbs).toBe(
        true
      );
    });

    it('still updates the signal when localStorage write throws', () => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota exceeded');
          },
          removeItem: () => undefined,
          clear: () => undefined,
        },
        writable: true,
      });

      expect(() => service.setShowBreadcrumbs(false)).not.toThrow();
      expect(service.showBreadcrumbs()).toBe(false);
    });
  });

  describe('setDenseLayout', () => {
    it('defaults the signal to true (dense) when nothing is stored', () => {
      expect(service.denseLayout()).toBe(true);
    });

    it('honours a stored false opt-out', () => {
      localStorageMock['userSettings'] = JSON.stringify({
        denseLayout: false,
      });
      const fresh = createService();
      expect(fresh.denseLayout()).toBe(false);
    });

    it('persists the value and updates the reactive signal', () => {
      service.setDenseLayout(false);
      expect(service.denseLayout()).toBe(false);
      expect(JSON.parse(localStorageMock['userSettings']).denseLayout).toBe(
        false
      );

      service.setDenseLayout(true);
      expect(service.denseLayout()).toBe(true);
      expect(JSON.parse(localStorageMock['userSettings']).denseLayout).toBe(
        true
      );
    });

    it('still updates the signal when localStorage write throws', () => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota exceeded');
          },
          removeItem: () => undefined,
          clear: () => undefined,
        },
        writable: true,
      });

      expect(() => service.setDenseLayout(true)).not.toThrow();
      expect(service.denseLayout()).toBe(true);
    });
  });

  describe('error handling', () => {
    it.each([
      ['invalid JSON', 'invalid json'],
      ['non-object JSON', '"string value"'],
      ['null', 'null'],
    ])('should handle %s in localStorage', (_label, stored) => {
      localStorageMock['userSettings'] = stored;
      const result = service.getSetting('test', 'default');
      expect(result).toBe('default');
    });
  });
});
