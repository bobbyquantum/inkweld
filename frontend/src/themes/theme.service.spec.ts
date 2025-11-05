import {
  DOCUMENT,
  provideZonelessChangeDetection,
  RendererFactory2,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Mock, vi } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;
  let matIconRegistry: MatIconRegistry;
  let domSanitizer: DomSanitizer;
  let localStorageSpy: any;
  let addClassSpy: Mock;
  let removeClassSpy: Mock;
  let mediaQueryList: MediaQueryList;
  let addEventListenerSpy: Mock;
  let removeEventListenerSpy: Mock;

  beforeEach(() => {
    addClassSpy = vi.fn();
    removeClassSpy = vi.fn();
    addEventListenerSpy = vi.fn();
    removeEventListenerSpy = vi.fn();

    mediaQueryList = {
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: vi.fn(),
    };

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => mediaQueryList),
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: RendererFactory2,
          useValue: {
            createRenderer: vi.fn(() => ({
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
                add: vi.fn(),
                remove: vi.fn(),
              },
            },
          },
        },
        {
          provide: MatIconRegistry,
          useValue: {
            addSvgIconLiteral: vi.fn(),
          },
        },
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustHtml: vi.fn(),
          },
        },
      ],
    });

    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
    matIconRegistry = TestBed.inject(MatIconRegistry);
    domSanitizer = TestBed.inject(DomSanitizer);
    localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(Storage.prototype, 'getItem');
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
