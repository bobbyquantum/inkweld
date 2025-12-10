import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetComponent } from './reset.component';

describe('ResetComponent', () => {
  let component: ResetComponent;
  let fixture: ComponentFixture<ResetComponent>;
  let router: Router;
  let originalIndexedDB: IDBFactory;

  beforeEach(async () => {
    // Save original indexedDB
    originalIndexedDB = globalThis.indexedDB;

    // Mock indexedDB.deleteDatabase
    const mockDeleteRequest = {
      onsuccess: null as ((evt: Event) => void) | null,
      onerror: null as ((evt: Event) => void) | null,
      onblocked: null as ((evt: Event) => void) | null,
    };

    const mockIndexedDB = {
      deleteDatabase: vi.fn(() => {
        // Schedule onsuccess callback
        setTimeout(() => {
          mockDeleteRequest.onsuccess?.({} as Event);
        }, 0);
        return mockDeleteRequest as unknown as IDBOpenDBRequest;
      }),
      databases: vi.fn().mockResolvedValue([]),
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: mockIndexedDB,
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [ResetComponent, NoopAnimationsModule],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ResetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Restore original indexedDB
    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display warning message', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain(
      'Are you sure you want to clear all stored data'
    );
  });

  it('should display list of data to be deleted', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('cached project covers');
    expect(compiled.textContent).toContain('offline project data');
    expect(compiled.textContent).toContain('session and login state');
  });

  it('should have clear data button', () => {
    const button = fixture.nativeElement.querySelector(
      '[data-testid="clear-data-button"]'
    );
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Proceed and Clear Data');
  });

  describe('clearAllData', () => {
    it('should set isClearing to true while clearing', async () => {
      expect(component.isClearing()).toBe(false);

      const clearPromise = component.clearAllData();
      expect(component.isClearing()).toBe(true);

      await clearPromise;
    });

    it('should navigate to /setup after clearing', async () => {
      await component.clearAllData();
      expect(router.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('should show spinner while clearing', async () => {
      const clearPromise = component.clearAllData();
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();

      await clearPromise;
    });

    it('should hide button while clearing', async () => {
      const clearPromise = component.clearAllData();
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector(
        '[data-testid="clear-data-button"]'
      );
      expect(button).toBeFalsy();

      await clearPromise;
    });

    it('should delete databases returned by indexedDB.databases()', async () => {
      // Mock databases() to return some databases
      const mockDeleteRequest = {
        onsuccess: null as ((evt: Event) => void) | null,
        onerror: null as ((evt: Event) => void) | null,
        onblocked: null as ((evt: Event) => void) | null,
      };

      const mockIndexedDB = {
        deleteDatabase: vi.fn(() => {
          setTimeout(() => {
            mockDeleteRequest.onsuccess?.({} as Event);
          }, 0);
          return mockDeleteRequest as unknown as IDBOpenDBRequest;
        }),
        databases: vi
          .fn()
          .mockResolvedValue([{ name: 'test-db' }, { name: 'another-db' }]),
      };

      Object.defineProperty(globalThis, 'indexedDB', {
        value: mockIndexedDB,
        writable: true,
        configurable: true,
      });

      await component.clearAllData();

      expect(mockIndexedDB.deleteDatabase).toHaveBeenCalledWith('test-db');
      expect(mockIndexedDB.deleteDatabase).toHaveBeenCalledWith('another-db');
    });

    it('should fall back to known databases when databases() throws', async () => {
      const mockDeleteRequest = {
        onsuccess: null as ((evt: Event) => void) | null,
        onerror: null as ((evt: Event) => void) | null,
        onblocked: null as ((evt: Event) => void) | null,
      };

      const mockIndexedDB = {
        deleteDatabase: vi.fn(() => {
          setTimeout(() => {
            mockDeleteRequest.onsuccess?.({} as Event);
          }, 0);
          return mockDeleteRequest as unknown as IDBOpenDBRequest;
        }),
        databases: vi.fn().mockRejectedValue(new Error('Not supported')),
      };

      Object.defineProperty(globalThis, 'indexedDB', {
        value: mockIndexedDB,
        writable: true,
        configurable: true,
      });

      await component.clearAllData();

      expect(mockIndexedDB.deleteDatabase).toHaveBeenCalledWith(
        'inkweld-media'
      );
      expect(mockIndexedDB.deleteDatabase).toHaveBeenCalledWith('inkweld-sync');
    });

    it('should clear cookies with existing cookies', async () => {
      // Mock document.cookie getter to return cookies
      const originalCookie = Object.getOwnPropertyDescriptor(
        Document.prototype,
        'cookie'
      );
      let cookieStore = 'session=abc123; token=xyz789';

      Object.defineProperty(document, 'cookie', {
        get: () => cookieStore,
        set: val => {
          cookieStore = val;
        },
        configurable: true,
      });

      await component.clearAllData();

      // Restore original cookie descriptor
      if (originalCookie) {
        Object.defineProperty(document, 'cookie', originalCookie);
      }

      expect(router.navigate).toHaveBeenCalledWith(['/setup']);
    });
  });
});
