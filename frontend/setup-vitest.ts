/**
 * Vitest Setup File for Angular Tests
 *
 * ⚠️  IMPORTANT: Do not run vitest directly!
 *
 * This project uses `npm test` (which runs `ng test`) to properly configure:
 * - Path aliases (@inkweld/*, @services/*, @components/*, etc.)
 * - Angular JIT compilation
 * - Proper test environment setup
 *
 * Running `npx vitest` directly will fail with import resolution errors.
 * Always use: npm test
 */

import 'fake-indexeddb/auto';
import '@angular/compiler'; // Required for JIT compilation in tests

import { afterEach, vi } from 'vitest';

// Mock @myriaddreamin/typst.ts globally BEFORE any imports that might use it
// This is needed for non-isolated test mode where module cache is shared
const mockTypstGlobal = {
  setCompilerInitOptions: vi.fn().mockReturnValue(undefined),
  setRendererInitOptions: vi.fn().mockReturnValue(undefined),
  pdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  mapShadow: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@myriaddreamin/typst.ts', () => {
  const mockCompiler = {
    init: vi.fn().mockResolvedValue(undefined),
    pdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    addSource: vi.fn().mockResolvedValue(undefined),
    mapShadow: vi.fn().mockResolvedValue(undefined),
  };
  const mockRenderer = {
    init: vi.fn().mockResolvedValue(undefined),
  };
  return {
    $typst: mockTypstGlobal,
    createTypstCompiler: vi.fn().mockResolvedValue(mockCompiler),
    createTypstRenderer: vi.fn().mockReturnValue(mockRenderer),
  };
});

vi.mock('@myriaddreamin/typst.ts/contrib/snippet', () => ({
  $typst: mockTypstGlobal,
}));

import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

// Initialize Angular testing environment for zoneless mode
// Only initialize if not already initialized (prevents errors in watch mode)
if (!getTestBed().platform) {
  getTestBed().initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
    {
      errorOnUnknownElements: true,
      errorOnUnknownProperties: true,
    }
  );
}

// Clean up after each test to prevent state leakage
// Note: Individual test files should handle their own cleanup in afterEach
// This global cleanup runs last and ensures TestBed is reset

afterEach(() => {
  // Restore any globals stubbed by test files (e.g., indexedDB, fetch)
  // This prevents cross-test contamination with isolate: false
  vi.unstubAllGlobals();

  // Ensure fake timers are restored so subsequent tests aren't affected
  vi.useRealTimers();

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

// Mock y-indexeddb with complete interface for non-isolated test mode
vi.mock('y-indexeddb', () => {
  return {
    IndexeddbPersistence: class IndexeddbPersistence {
      whenSynced = Promise.resolve();
      synced = true;
      private readonly _listeners = new Map<string, Set<(...args: any[]) => void>>();

      constructor(_name: string, _doc: any) {}

      on(event: string, callback: (...args: any[]) => void): void {
        if (!this._listeners.has(event)) {
          this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(callback);
        // If already synced, immediately call synced handler
        if (event === 'synced' && this.synced) {
          queueMicrotask(() => callback());
        }
      }

      off(event: string, callback: (...args: any[]) => void): void {
        this._listeners.get(event)?.delete(callback);
      }

      destroy() {
        this._listeners.clear();
        return Promise.resolve();
      }
    },
    storeState: () => Promise.resolve(),
    fetchUpdates: () => Promise.resolve(),
    clearDocument: () => Promise.resolve(),
  };
});

// Mock y-websocket with complete interface for non-isolated test mode
vi.mock('y-websocket', () => {
  return {
    WebsocketProvider: class WebsocketProvider {
      ws: { onmessage: null; send: () => {} } | null = null;
      awareness = {
        setLocalState: () => {},
        setLocalStateField: () => {},
        getStates: () => new Map(),
        clientID: 123,
      };
      private readonly _listeners = new Map<string, Set<(...args: any[]) => void>>();

      constructor(_url: string, _room: string, _doc: any, _options?: any) {}

      on(event: string, callback: (...args: any[]) => void): void {
        if (!this._listeners.has(event)) {
          this._listeners.set(event, new Set());
        }
        this._listeners.get(event)!.add(callback);
      }

      off(event: string, callback: (...args: any[]) => void): void {
        this._listeners.get(event)?.delete(callback);
      }

      connect(): void {
        this.ws = { onmessage: null, send: () => ({}) };
      }

      disconnect(): void {
        this.ws = null;
      }

      destroy(): void {
        this._listeners.clear();
        this.ws = null;
      }
    },
  };
});

// Mock prosemirror-commands for components that use it
vi.mock('prosemirror-commands', () => ({
  toggleMark:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
}));

// Mock prosemirror-history for editor-toolbar
vi.mock('prosemirror-history', () => ({
  undo: (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
    if (dispatch) dispatch({});
    return true;
  },
  redo: (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
    if (dispatch) dispatch({});
    return true;
  },
}));

// Mock @bobbyquantum/ngx-editor globally to avoid intermittent vi.mock failures
// from Angular's vitest-mock-patch with isolate: false. Individual specs used to
// mock this per-file, but the hoisted vi.mock races with the shared module cache.
vi.mock('@bobbyquantum/ngx-editor', () => {
  const { Subject } = require('rxjs');

  const createMockMark = (name: string) => ({
    name,
    isInSet: () => false,
    create: () => ({ type: { name } }),
  });

  const mockSchema = {
    marks: {
      strong: createMockMark('strong'),
      em: createMockMark('em'),
      u: createMockMark('u'),
      s: createMockMark('s'),
      link: createMockMark('link'),
    },
    nodes: {
      ordered_list: { name: 'ordered_list' },
      bullet_list: { name: 'bullet_list' },
      list_item: { name: 'list_item' },
      heading: { name: 'heading' },
      blockquote: { name: 'blockquote' },
      paragraph: { name: 'paragraph' },
    },
  };

  class MockEditor {
    view = {
      state: {
        plugins: [],
        doc: {
          textBetween: () => '',
          content: { size: 0 },
          nodeSize: 0,
          rangeHasMark: () => false,
        },
        selection: {
          from: 0,
          to: 0,
          $from: { marks: () => [] },
          empty: true,
          ranges: [],
        },
        reconfigure: () => ({}),
        schema: mockSchema,
        storedMarks: null,
        tr: {
          addMark: () => ({}),
          removeMark: () => ({}),
        },
      },
      updateState: () => {},
      dispatch: () => {},
      focus: () => {},
      coordsAtPos: () => ({ left: 0, top: 0, right: 0, bottom: 0 }),
      hasFocus: () => false,
    };
    update = new Subject();
    destroy = () => {};
  }

  return {
    Editor: MockEditor,
    Toolbar: Array,
    NgxEditorModule: Object,
    NgxEditorComponent: Object,
    NgxEditorMenuComponent: Object,
    NgxEditorFloatingMenuComponent: Object,
    NgxEditorService: Object,
    ImageViewComponent: Object,
    DEFAULT_TOOLBAR: [],
    TOOLBAR_FULL: [],
    TOOLBAR_MINIMAL: [],
    Validators: {},
    emptyDoc: () => {},
    getKeyboardShortcuts: () => {},
    parseContent: () => {},
    toDoc: () => {},
    toHTML: () => {},
    NGX_EDITOR_CONFIG_TOKEN: Symbol('NGX_EDITOR_CONFIG_TOKEN'),
    provideMyServiceOptions: () => {},
  };
});

// Mock prosemirror-schema-list for list operations (wrapInList, liftListItem, etc.)
vi.mock('prosemirror-schema-list', () => ({
  wrapInList:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
  liftListItem:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
  sinkListItem:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
  splitListItem:
    () =>
    (_state: unknown, dispatch?: (tr: unknown) => void): boolean => {
      if (dispatch) dispatch({});
      return true;
    },
}));

// Mock File.arrayBuffer for jsdom (only if not already defined)
if (!File.prototype.arrayBuffer) {
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
}

// Mock Blob.text for jsdom (only if not already defined)
if (!Blob.prototype.text) {
  Object.defineProperty(Blob.prototype, 'text', {
    value: function () {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    },
  });
}

// Mock URL.createObjectURL and URL.revokeObjectURL for jsdom environment
(globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock-url');
(globalThis as any).URL.revokeObjectURL = vi.fn();

// Note: JSZip (@progress/jszip-esm) is NOT mocked globally.
// All test files use the real JSZip, which works fine in the test environment.
// Avoid vi.mock('@progress/jszip-esm') — it intermittently fails with
// "Cannot read properties of undefined (reading 'trim')" in Angular's
// vitest-mock-patch when isolate: false shares module cache across files.

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

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia for Angular CDK BreakpointObserver
// This is required for components using BreakpointObserver (dialogs, responsive components)
// Uses plain functions (not vi.fn()) so vi.restoreAllMocks() doesn't clear them
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock window.location.reload for tests that trigger page reloads
// (e.g., connection-settings component after server mode switch)
// Uses plain functions so vi.restoreAllMocks() doesn't clear them
Object.defineProperty(window, 'location', {
  writable: true,
  value: {
    ...window.location,
    reload: () => {},
    href: window.location?.href || 'http://localhost/',
    origin: window.location?.origin || 'http://localhost',
    pathname: window.location?.pathname || '/',
    search: window.location?.search || '',
    hash: window.location?.hash || '',
  },
});
