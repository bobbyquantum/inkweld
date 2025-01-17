import { DOCUMENT } from '@angular/common';
import { RendererFactory2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;
  let matIconRegistry: MatIconRegistry;
  let domSanitizer: DomSanitizer;
  let localStorageSpy: jest.SpyInstance;
  let addClassSpy: jest.Mock;
  let removeClassSpy: jest.Mock;
  let mediaQueryList: MediaQueryList;
  let addEventListenerSpy: jest.Mock;
  let removeEventListenerSpy: jest.Mock;

  beforeEach(() => {
    addClassSpy = jest.fn();
    removeClassSpy = jest.fn();
    addEventListenerSpy = jest.fn();
    removeEventListenerSpy = jest.fn();

    mediaQueryList = {
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: jest.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => mediaQueryList),
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: RendererFactory2,
          useValue: {
            createRenderer: jest.fn(() => ({
              addClass: addClassSpy,
              removeClass: removeClassSpy,
            })),
          },
        },
        {
          provide: DOCUMENT,
          useValue: {
            body: {
              classList: {
                add: jest.fn(),
                remove: jest.fn(),
              },
            },
          },
        },
        {
          provide: MatIconRegistry,
          useValue: {
            addSvgIconLiteral: jest.fn(),
          },
        },
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustHtml: jest.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
    matIconRegistry = TestBed.inject(MatIconRegistry);
    domSanitizer = TestBed.inject(DomSanitizer);
    localStorageSpy = jest.spyOn(Storage.prototype, 'setItem');
    jest.spyOn(Storage.prototype, 'getItem');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with system theme by default', () => {
    service.initTheme();
    expect(localStorage.getItem).toHaveBeenCalledWith('user-theme');
  });

  it('should update theme and persist in localStorage', () => {
    service.update('dark-theme');
    expect(localStorageSpy).toHaveBeenCalledWith('user-theme', 'dark-theme');
    expect(addClassSpy).toHaveBeenCalledWith(document.body, 'dark-theme');
  });

  it('should detect system dark mode', () => {
    expect(service.isDarkMode()).toBe(true);
  });

  it('should register custom icons on initialization', () => {
    service.initTheme();
    expect(matIconRegistry.addSvgIconLiteral).toHaveBeenCalledTimes(3);
    expect(domSanitizer.bypassSecurityTrustHtml).toHaveBeenCalled();
  });

  it('should update body class when system theme changes', () => {
    service.initTheme();
    expect(addEventListenerSpy).toHaveBeenCalled();
  });

  it('should clean up event listeners on destroy', () => {
    service.ngOnDestroy();
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });

  it('should handle theme switching between light and dark', () => {
    service.update('light-theme');
    expect(addClassSpy).toHaveBeenCalledWith(document.body, 'light-theme');
    expect(removeClassSpy).toHaveBeenCalledWith(document.body, 'dark-theme');

    service.update('dark-theme');
    expect(addClassSpy).toHaveBeenCalledWith(document.body, 'dark-theme');
    expect(removeClassSpy).toHaveBeenCalledWith(document.body, 'light-theme');
  });

  it('should handle system theme preference', () => {
    service.update('system');
    expect(localStorageSpy).toHaveBeenCalledWith('user-theme', 'system');
    expect(addClassSpy).toHaveBeenCalledWith(
      document.body,
      expect.stringMatching(/(light|dark)-theme/)
    );
  });
});
