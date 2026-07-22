import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { TranslocoHttpLoader } from './transloco-loader';

import { translocoTestProvider } from '../testing/transloco-test-provider';

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

  const mockEditor = { find: 'Find' };
  const mockProject = { title: 'Project' };
  const mockDialogs = { confirm: 'Confirm' };
  const mockAdmin = { dashboard: 'Dashboard' };
  const mockAuth = { signIn: 'Sign In' };
  const mockCanvas = { draw: 'Draw' };
  const mockTimeline = { events: 'Events' };
  const mockMedia = { upload: 'Upload' };
  const mockWorldbuilding = { create: 'Create' };
  const mockPublish = { publish: 'Publish' };
  const mockAbout = { version: 'Version' };
  const mockRelationships = { add: 'Add' };
  const mockTags = { tag: 'Tag' };
  const mockTemplates = { template: 'Template' };
  const mockMessages = { inbox: 'Inbox' };

  const allScopeMocks: Record<string, Record<string, unknown>> = {
    app: mockApp,
    login: mockLogin,
    home: mockHome,
    settings: mockSettings,
    editor: mockEditor,
    project: mockProject,
    dialogs: mockDialogs,
    admin: mockAdmin,
    auth: mockAuth,
    canvas: mockCanvas,
    timeline: mockTimeline,
    media: mockMedia,
    worldbuilding: mockWorldbuilding,
    publish: mockPublish,
    about: mockAbout,
    relationships: mockRelationships,
    tags: mockTags,
    templates: mockTemplates,
    messages: mockMessages,
  };

  const allScopeNames = Object.keys(allScopeMocks);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [translocoTestProvider(), HttpClientTestingModule],
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
    function flushAllScopes(
      lang: string,
      overrides?: Record<string, Record<string, unknown>>
    ) {
      httpMock.expectOne(`/assets/i18n/${lang}/common.json`).flush(mockCommon);
      for (const scope of allScopeNames) {
        const mock = overrides?.[scope] ?? allScopeMocks[scope];
        httpMock.expectOne(`/assets/i18n/${lang}/${scope}.json`).flush(mock);
      }
    }

    function expectedTranslation(
      overrides?: Record<string, Record<string, unknown>>
    ) {
      const result: Record<string, unknown> = { ...mockCommon };
      for (const scope of allScopeNames) {
        result[scope] = overrides?.[scope] ?? allScopeMocks[scope];
      }
      return result;
    }

    it('should fetch and merge all scope files', () => {
      loader.getTranslation('en').subscribe(translation => {
        expect(translation).toEqual(expectedTranslation());
      });

      flushAllScopes('en');
    });

    it('should handle different language', () => {
      loader.getTranslation('fr').subscribe(translation => {
        expect(translation).toEqual(expectedTranslation());
      });

      flushAllScopes('fr');
    });

    it('should merge scopes into common translations', () => {
      loader.getTranslation('en').subscribe(translation => {
        // Common keys should be at root level
        expect(translation['cancel']).toBe('Cancel');
        expect(translation['close']).toBe('Close');

        // Scope keys should be nested
        for (const scope of allScopeNames) {
          expect(translation[scope]).toEqual(allScopeMocks[scope]);
        }
      });

      flushAllScopes('en');
    });

    it('should handle empty scope translations', () => {
      const emptyScope = {};
      const overrides: Record<string, Record<string, unknown>> = {
        login: emptyScope,
      };

      loader.getTranslation('en').subscribe(translation => {
        expect(translation).toEqual(expectedTranslation(overrides));
      });

      flushAllScopes('en', overrides);
    });
  });
});
