import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LocaleService } from './locale.service';

const { spyOn } = vi;

describe('LocaleService', () => {
  let service: LocaleService;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [LocaleService],
    });

    service = TestBed.inject(LocaleService);
    transloco = TestBed.inject(TranslocoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('availableLangs', () => {
    it('should return available languages from transloco config', () => {
      const availableLangs = service.availableLangs;
      expect(availableLangs).toEqual([{ id: 'en', label: 'English' }]);
    });
  });

  describe('currentLang', () => {
    it('should return the active language', () => {
      expect(service.currentLang).toBe('en');
    });
  });

  describe('init', () => {
    it('should load saved language from localStorage', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');
      localStorage.setItem('inkweld-lang', 'en');

      service.init();

      expect(setLangSpy).toHaveBeenCalledWith('en');
      localStorage.removeItem('inkweld-lang');
    });

    it('should not load invalid saved language', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');
      localStorage.setItem('inkweld-lang', 'invalid-lang');

      service.init();

      expect(setLangSpy).not.toHaveBeenCalled();
      localStorage.removeItem('inkweld-lang');
    });

    it('should do nothing if no language is saved', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');
      localStorage.removeItem('inkweld-lang');

      service.init();

      expect(setLangSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLang', () => {
    it('should set language and save to localStorage', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');

      service.setLang('en');

      expect(setLangSpy).toHaveBeenCalledWith('en');
      expect(localStorage.getItem('inkweld-lang')).toBe('en');
      localStorage.removeItem('inkweld-lang');
    });

    it('should not set invalid language', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');

      service.setLang('invalid-lang');

      expect(setLangSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('inkweld-lang')).toBeNull();
    });

    it('should not set language when it is not in available langs', () => {
      const setLangSpy = spyOn(transloco, 'setActiveLang');

      service.setLang('fr');

      expect(setLangSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem('inkweld-lang')).toBeNull();
    });
  });

  describe('isLangAvailable', () => {
    it('should return true for available language string', () => {
      // The private method is tested indirectly through setLang
      // but we can verify the behavior through the public API
      const availableLangs = service.availableLangs;
      expect(
        availableLangs.some(l => (typeof l === 'string' ? l : l.id) === 'en')
      ).toBe(true);
    });
  });
});
