import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { TranslocoHttpLoader } from './transloco-loader';

describe('TranslocoHttpLoader', () => {
  let loader: TranslocoHttpLoader;
  let httpMock: HttpTestingController;

  const mockCommon = {
    cancel: 'Cancel',
    close: 'Close',
    errors: {
      unknown: 'Something went wrong',
    },
  };

  const mockApp = {
    updateNow: 'Update Now',
    sessionExpiredMessage: 'Your session has expired',
  };

  const mockLogin = {
    title: 'Login',
    signInWithPasskey: 'Sign in with passkey',
  };

  const mockHome = {
    searchProjects: 'Search projects',
    syncAll: 'Sync All',
  };

  const mockSettings = {
    language: 'Language',
    moreLanguages: 'More languages coming soon',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TranslocoHttpLoader],
    });

    loader = TestBed.inject(TranslocoHttpLoader);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(loader).toBeTruthy();
  });

  describe('getTranslation', () => {
    it('should fetch and merge all scope files', () => {
      loader.getTranslation('en').subscribe(translation => {
        expect(translation).toEqual({
          ...mockCommon,
          app: mockApp,
          login: mockLogin,
          home: mockHome,
          settings: mockSettings,
        });
      });

      // Expect 5 HTTP requests (common + 4 scopes)
      const commonReq = httpMock.expectOne('/assets/i18n/en/common.json');
      expect(commonReq.request.method).toBe('GET');
      commonReq.flush(mockCommon);

      const appReq = httpMock.expectOne('/assets/i18n/en/app.json');
      expect(appReq.request.method).toBe('GET');
      appReq.flush(mockApp);

      const loginReq = httpMock.expectOne('/assets/i18n/en/login.json');
      expect(loginReq.request.method).toBe('GET');
      loginReq.flush(mockLogin);

      const homeReq = httpMock.expectOne('/assets/i18n/en/home.json');
      expect(homeReq.request.method).toBe('GET');
      homeReq.flush(mockHome);

      const settingsReq = httpMock.expectOne('/assets/i18n/en/settings.json');
      expect(settingsReq.request.method).toBe('GET');
      settingsReq.flush(mockSettings);
    });

    it('should handle different language', () => {
      loader.getTranslation('fr').subscribe(translation => {
        expect(translation).toEqual({
          ...mockCommon,
          app: mockApp,
          login: mockLogin,
          home: mockHome,
          settings: mockSettings,
        });
      });

      httpMock.expectOne('/assets/i18n/fr/common.json').flush(mockCommon);
      httpMock.expectOne('/assets/i18n/fr/app.json').flush(mockApp);
      httpMock.expectOne('/assets/i18n/fr/login.json').flush(mockLogin);
      httpMock.expectOne('/assets/i18n/fr/home.json').flush(mockHome);
      httpMock.expectOne('/assets/i18n/fr/settings.json').flush(mockSettings);
    });

    it('should merge scopes into common translations', () => {
      loader.getTranslation('en').subscribe(translation => {
        // Common keys should be at root level
        expect(translation['cancel']).toBe('Cancel');
        expect(translation['close']).toBe('Close');

        // Scope keys should be nested
        expect(translation['app']).toEqual(mockApp);
        expect(translation['login']).toEqual(mockLogin);
        expect(translation['home']).toEqual(mockHome);
        expect(translation['settings']).toEqual(mockSettings);
      });

      httpMock.expectOne('/assets/i18n/en/common.json').flush(mockCommon);
      httpMock.expectOne('/assets/i18n/en/app.json').flush(mockApp);
      httpMock.expectOne('/assets/i18n/en/login.json').flush(mockLogin);
      httpMock.expectOne('/assets/i18n/en/home.json').flush(mockHome);
      httpMock.expectOne('/assets/i18n/en/settings.json').flush(mockSettings);
    });

    it('should handle empty scope translations', () => {
      const emptyScope = {};

      loader.getTranslation('en').subscribe(translation => {
        expect(translation).toEqual({
          ...mockCommon,
          app: mockApp,
          login: emptyScope,
          home: mockHome,
          settings: mockSettings,
        });
      });

      httpMock.expectOne('/assets/i18n/en/common.json').flush(mockCommon);
      httpMock.expectOne('/assets/i18n/en/app.json').flush(mockApp);
      httpMock.expectOne('/assets/i18n/en/login.json').flush(emptyScope);
      httpMock.expectOne('/assets/i18n/en/home.json').flush(mockHome);
      httpMock.expectOne('/assets/i18n/en/settings.json').flush(mockSettings);
    });
  });
});
