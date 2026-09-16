import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PopoutService } from './popout.service';

describe('PopoutService', () => {
  let sessionStore: Record<string, string>;
  let originalSessionStorage: PropertyDescriptor | undefined;
  let originalLocation: PropertyDescriptor | undefined;
  let openSpy: ReturnType<typeof vi.fn>;
  let originalOpen: typeof globalThis.open;

  /** Builds a service against the current location/sessionStorage fakes. */
  function createService(): PopoutService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), PopoutService],
    });
    return TestBed.inject(PopoutService);
  }

  /** Points the fake location at a query string, e.g. '?popout=1'. */
  function setSearch(search: string): void {
    Object.defineProperty(globalThis, 'location', {
      value: { ...globalThis.location, search },
      configurable: true,
      writable: true,
    });
  }

  beforeEach(() => {
    sessionStore = {};
    originalSessionStorage = Object.getOwnPropertyDescriptor(
      globalThis,
      'sessionStorage'
    );
    originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
    originalOpen = globalThis.open;

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: (key: string) => sessionStore[key] ?? null,
        setItem: (key: string, value: string) => {
          sessionStore[key] = value;
        },
        removeItem: (key: string) => {
          delete sessionStore[key];
        },
      },
      configurable: true,
      writable: true,
    });

    openSpy = vi.fn(() => ({ focus: vi.fn() }) as unknown as Window);
    globalThis.open = openSpy as unknown as typeof globalThis.open;

    setSearch('');
  });

  afterEach(() => {
    globalThis.open = originalOpen;
    if (originalSessionStorage) {
      Object.defineProperty(
        globalThis,
        'sessionStorage',
        originalSessionStorage
      );
    }
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation);
    }
  });

  it('reports an ordinary window as not a pop-out', () => {
    expect(createService().isPopout()).toBe(false);
  });

  it('recognises a window opened with the pop-out parameter', () => {
    setSearch('?popout=1');

    expect(createService().isPopout()).toBe(true);
  });

  it('stays a pop-out after the parameter leaves the URL', () => {
    setSearch('?popout=1');
    createService();

    // Angular's router drops the query string on the first in-app navigation;
    // a reload then starts with a bare URL and must still be a pop-out.
    setSearch('');

    expect(createService().isPopout()).toBe(true);
  });

  it('does not treat other values of the parameter as a pop-out', () => {
    setSearch('?popout=0');

    expect(createService().isPopout()).toBe(false);
  });

  it('falls back to the URL when session storage is unavailable', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      },
      configurable: true,
    });
    setSearch('?popout=1');

    expect(createService().isPopout()).toBe(true);
  });

  it('builds a document URL carrying the pop-out parameter', () => {
    const url = createService().buildUrl('ada', 'my-novel', 'el-7');

    expect(url).toBe('/ada/my-novel/document/el-7?popout=1');
  });

  it('escapes path segments that need it', () => {
    const url = createService().buildUrl('a b', 'sl/ug', 'el 7');

    expect(url).toBe('/a%20b/sl%2Fug/document/el%207?popout=1');
  });

  it('opens a named window so the same document reuses it', () => {
    const service = createService();

    expect(service.openDocument('ada', 'my-novel', 'el-7')).toBe(true);
    expect(openSpy).toHaveBeenCalledTimes(1);

    const [url, name, features] = openSpy.mock.calls[0] as [
      string,
      string,
      string,
    ];
    expect(url).toBe('/ada/my-novel/document/el-7?popout=1');
    expect(name).toBe('inkweld-doc-ada-my-novel-el-7');
    expect(features).toContain('popup=yes');
  });

  it('focuses the window it opened', () => {
    const focus = vi.fn();
    openSpy.mockReturnValue({ focus });

    createService().openDocument('ada', 'my-novel', 'el-7');

    expect(focus).toHaveBeenCalled();
  });

  it('reports failure when the browser blocks the window', () => {
    openSpy.mockReturnValue(null);

    expect(createService().openDocument('ada', 'my-novel', 'el-7')).toBe(false);
  });

  it('still reports success when the window refuses to be focused', () => {
    openSpy.mockReturnValue({
      focus: () => {
        throw new Error('cross-origin');
      },
    });

    expect(createService().openDocument('ada', 'my-novel', 'el-7')).toBe(true);
  });
});
