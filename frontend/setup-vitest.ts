import 'fake-indexeddb/auto';
import '@angular/compiler'; // Required for JIT compilation in tests

import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { vi } from 'vitest';

// Initialize Angular testing environment for zoneless mode
// Only initialize if not already initialized (prevents errors in watch mode)
if (!getTestBed().platform) {
  getTestBed().initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    {
      errorOnUnknownElements: true,
      errorOnUnknownProperties: true,
    }
  );
}

// Clean up after each test to prevent state leakage
// Note: Individual test files should handle their own cleanup in afterEach
// This global cleanup runs last and ensures TestBed is reset
import { afterEach } from 'vitest';

afterEach(() => {
  // Use destroyAfterEach instead of resetTestingModule for better cleanup
  try {
    getTestBed().resetTestingModule();
  } catch (e) {
    // Ignore errors if TestBed was already reset
  }
});

// Mock nanoid
vi.mock('nanoid', () => {
  let counter = 0;
  return {
    nanoid: () => `test-id-${counter++}`,
  };
});

// Only mock the side-effect packages (network/storage), not pure logic libraries
// Yjs core, ProseMirror, and y-prosemirror are pure JS/TS and work fine in tests

// Mock y-indexeddb
vi.mock('y-indexeddb', () => {
  return {
    IndexeddbPersistence: class {
      whenSynced = Promise.resolve();
      constructor(_name: string, _doc: any) {}
      destroy() { return Promise.resolve(); }
    },
  };
});

// Mock y-websocket
vi.mock('y-websocket', () => {
  return {
    WebsocketProvider: class {
      awareness = { setLocalState: () => {}, getStates: () => new Map() };
      constructor(_url: string, _room: string, _doc: any, _options?: any) {}
      on(_event: string, _callback: (...args: any[]) => void): void {}
      connect(): void {}
      destroy(): void {}
    },
  };
});

// Mock File.arrayBuffer for jsdom
Object.defineProperty(File.prototype, 'arrayBuffer', {
  value: function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  },
});

// Mock URL.createObjectURL and URL.revokeObjectURL for jsdom environment
(global as any).URL.createObjectURL = vi.fn(() => 'blob:mock-url');
(global as any).URL.revokeObjectURL = vi.fn();

// Mock localStorage for jsdom environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(global, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
});
