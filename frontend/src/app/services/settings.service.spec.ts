import { TestBed } from '@angular/core/testing';

import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let localStorageMock: { [key: string]: string };

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

    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
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
      expect(service.getSetting('object', {})).toEqual({ key: 'value' });
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

  describe('error handling', () => {
    it('should handle invalid JSON in localStorage', () => {
      localStorageMock['userSettings'] = 'invalid json';
      const result = service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle non-object JSON in localStorage', () => {
      localStorageMock['userSettings'] = '"string value"';
      const result = service.getSetting('test', 'default');
      expect(result).toBe('default');
    });

    it('should handle null in localStorage', () => {
      localStorageMock['userSettings'] = 'null';
      const result = service.getSetting('test', 'default');
      expect(result).toBe('default');
    });
  });
});
