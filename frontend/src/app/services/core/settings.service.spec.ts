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

  describe('setFolderClickOpens', () => {
    it('defaults the signal to false when nothing is stored', () => {
      expect(service.folderClickOpens()).toBe(false);
    });

    it('honours a stored opt-in', () => {
      localStorageMock['userSettings'] = JSON.stringify({
        folderClickOpens: true,
      });
      expect(createService().folderClickOpens()).toBe(true);
    });

    it('persists the value and updates the reactive signal', () => {
      service.setFolderClickOpens(true);
      expect(service.folderClickOpens()).toBe(true);
      expect(
        JSON.parse(localStorageMock['userSettings']).folderClickOpens
      ).toBe(true);
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

      expect(() => service.setFolderClickOpens(true)).not.toThrow();
      expect(service.folderClickOpens()).toBe(true);
    });
  });

  describe('setMarkdownShortcuts', () => {
    it('defaults the signal to false when nothing is stored', () => {
      expect(service.markdownShortcuts()).toBe(false);
    });

    it('honours a stored opt-in', () => {
      localStorageMock['userSettings'] = JSON.stringify({
        markdownShortcuts: true,
      });
      expect(createService().markdownShortcuts()).toBe(true);
    });

    it('persists the value and updates the reactive signal', () => {
      service.setMarkdownShortcuts(true);
      expect(service.markdownShortcuts()).toBe(true);
      expect(
        JSON.parse(localStorageMock['userSettings']).markdownShortcuts
      ).toBe(true);
    });
  });

  describe('setAiAllowed', () => {
    it('defaults to No AI when nothing is stored', () => {
      expect(service.aiAllowed()).toBe(false);
    });

    it('honours a stored Allow AI', () => {
      localStorageMock['inkweld-ai'] = 'allow';
      expect(createService().aiAllowed()).toBe(true);
    });

    it('stores the choice for the browser, outside any profile', () => {
      service.setAiAllowed(true);
      expect(service.aiAllowed()).toBe(true);
      expect(localStorageMock['inkweld-ai']).toBe('allow');
      expect(localStorageMock['userSettings']).toBeUndefined();

      service.setAiAllowed(false);
      expect(service.aiAllowed()).toBe(false);
      expect(localStorageMock['inkweld-ai']).toBe('none');
    });

    it('treats a stored No AI as a choice, and nothing stored as none', () => {
      expect(service.hasLocalAiChoice()).toBe(false);
      localStorageMock['inkweld-ai'] = 'none';
      const fresh = createService();
      expect(fresh.aiAllowed()).toBe(false);
      expect(fresh.hasLocalAiChoice()).toBe(true);
    });

    it('marks the choice as not yet on the account', () => {
      expect(service.aiChoiceUnsynced()).toBe(false);
      service.setAiAllowed(true);
      expect(service.aiChoiceUnsynced()).toBe(true);
      expect(localStorageMock['inkweld-ai-unsynced']).toBe('1');
      expect(createService().aiChoiceUnsynced()).toBe(true);
    });

    it('works when storage throws', () => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('blocked');
          },
          setItem: () => {
            throw new Error('blocked');
          },
          removeItem: () => {
            throw new Error('blocked');
          },
        },
        writable: true,
      });
      const blocked = createService();
      expect(blocked.aiAllowed()).toBe(false);
      blocked.setAiAllowed(true);
      expect(blocked.aiAllowed()).toBe(true);
      expect(blocked.hasLocalAiChoice()).toBe(false);
    });
  });

  describe('applyAccountAiChoice', () => {
    it("takes the account's choice without marking it unsynced", () => {
      service.applyAccountAiChoice(true);
      expect(service.aiAllowed()).toBe(true);
      expect(localStorageMock['inkweld-ai']).toBe('allow');
      expect(service.aiChoiceUnsynced()).toBe(false);
    });

    it('stores an account No AI so the browser has a choice', () => {
      service.applyAccountAiChoice(false);
      expect(localStorageMock['inkweld-ai']).toBe('none');
    });
  });

  describe('markAiChoiceSynced', () => {
    it('clears the flag once the account has the current choice', () => {
      service.setAiAllowed(true);
      service.markAiChoiceSynced(true);
      expect(service.aiChoiceUnsynced()).toBe(false);
      expect(localStorageMock['inkweld-ai-unsynced']).toBeUndefined();
    });

    it('keeps the flag when the choice changed while it was being sent', () => {
      service.setAiAllowed(true);
      service.setAiAllowed(false);
      service.markAiChoiceSynced(true);
      expect(service.aiChoiceUnsynced()).toBe(true);
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
