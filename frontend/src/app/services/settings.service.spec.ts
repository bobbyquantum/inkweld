import { createServiceFactory, SpectatorService } from '@ngneat/spectator/vitest';

import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let spectator: SpectatorService<SettingsService>;
  let localStorageMock: { [key: string]: string };

  const createService = createServiceFactory({
    service: SettingsService,
  });

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

    spectator = createService();
  });

  it('should be created', () => {
    expect(spectator.service).toBeTruthy();
  });

  describe('getSetting', () => {
    it('should return default value when setting does not exist', () => {
      const result = spectator.service.getSetting('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('should return stored value when setting exists', () => {
      spectator.service.setSetting('test', 'value');
      const result = spectator.service.getSetting('test', 'default');
      expect(result).toBe('value');
    });

    it('should return default value when stored value is null', () => {
      spectator.service.setSetting('test', null);
      const result = spectator.service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle different types of values', () => {
      spectator.service.setSetting('number', 42);
      spectator.service.setSetting('boolean', true);
      spectator.service.setSetting('object', { key: 'value' });

      expect(spectator.service.getSetting('number', 0)).toBe(42);
      expect(spectator.service.getSetting('boolean', false)).toBe(true);
      expect(spectator.service.getSetting('object', {})).toEqual({
        key: 'value',
      });
    });
  });

  describe('setSetting', () => {
    it('should store value in localStorage', () => {
      spectator.service.setSetting('test', 'value');
      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings.test).toBe('value');
    });

    it('should preserve existing settings when adding new ones', () => {
      spectator.service.setSetting('first', 'one');
      spectator.service.setSetting('second', 'two');

      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings).toEqual({
        first: 'one',
        second: 'two',
      });
    });

    it('should update existing setting', () => {
      spectator.service.setSetting('test', 'original');
      spectator.service.setSetting('test', 'updated');

      const storedSettings = JSON.parse(localStorageMock['userSettings']);
      expect(storedSettings.test).toBe('updated');
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON in localStorage', () => {
      localStorageMock['userSettings'] = 'invalid json';
      const result = spectator.service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle non-object JSON in localStorage', () => {
      localStorageMock['userSettings'] = '"string value"';
      const result = spectator.service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle null in localStorage', () => {
      localStorageMock['userSettings'] = 'null';
      const result = spectator.service.getSetting('test', 'default');
      expect(result).toBe('default');
    });
  });
});
