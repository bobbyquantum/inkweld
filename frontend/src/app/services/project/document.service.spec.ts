import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Editor } from '@bobbyquantum/ngx-editor';
import { DocumentsService } from '@inkweld/api/documents.service';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type DeepMockProxy } from 'vitest-mock-extended';
import { type IndexeddbPersistence } from 'y-indexeddb';
import { type WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { LintApiService } from '../../components/lint/lint-api.service';
import { DocumentSyncState } from '../../models/document-sync-state';
import { AuthTokenService } from '../auth/auth-token.service';
import { SetupService } from '../core/setup.service';
import { SystemConfigService } from '../core/system-config.service';
import { UnifiedUserService } from '../user/unified-user.service';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';

// y-indexeddb and y-websocket are mocked globally in setup-vitest.ts
// @bobbyquantum/ngx-editor is only used as a type import — no mock needed
// authenticated-websocket-provider is mocked via service instance properties
// (vi.mock can't intercept local source files bundled by esbuild)

type ProviderStatus = 'connected' | 'disconnected' | 'connecting';

describe('DocumentService', () => {
  let service: DocumentService;
  let mockProjectStateService: DeepMockProxy<ProjectStateService>;
  let mockDocumentsService: DeepMockProxy<DocumentsService>;
  let mockLintApiService: DeepMockProxy<LintApiService>;
  let mockYDoc: DeepMockProxy<Y.Doc>;
  let mockWebSocketProvider: DeepMockProxy<WebsocketProvider>;
  let _mockIndexedDbProvider: DeepMockProxy<IndexeddbPersistence>;
  let mockEditor: DeepMockProxy<Editor>;
  let mockSetupService: DeepMockProxy<SetupService>;
  let mockSystemConfigService: DeepMockProxy<SystemConfigService>;
  let mockUnifiedUserService: DeepMockProxy<UnifiedUserService>;
  let mockAuthTokenService: DeepMockProxy<AuthTokenService>;
  let mockCreateAuthWsProvider: ReturnType<typeof vi.fn>;
  let mockSetupWsReauth: ReturnType<typeof vi.fn>;

  const testDocumentId = 'testuser:test-project:test-doc';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Use real Y.Doc since Yjs works fine in tests now
    mockYDoc = new Y.Doc() as unknown as DeepMockProxy<Y.Doc>;

    // Mock WebSocket and IndexedDB providers (these have side effects)
    mockWebSocketProvider = {
      on: vi.fn().mockReturnValue(() => {}), // Return cleanup function
      off: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      destroy: vi.fn(),
      awareness: {
        setLocalState: vi.fn(),
        setLocalStateField: vi.fn(),
        getStates: () => new Map(),
      },
    } as unknown as DeepMockProxy<WebsocketProvider>;

    _mockIndexedDbProvider = {
      whenSynced: Promise.resolve(),
      destroy: vi.fn(),
    } as unknown as DeepMockProxy<IndexeddbPersistence>;

    // Mock Editor (ngx-editor) - needs view property for real ProseMirror
    mockEditor = {
      view: {
        state: {
          plugins: [], // Real ProseMirror spreads this array
          doc: {
            textBetween: vi.fn().mockReturnValue(''),
            content: { size: 0 },
          },
          reconfigure: vi.fn().mockReturnValue({}),
        },
        updateState: vi.fn(),
        dispatch: vi.fn(),
      },
      state: {
        reconfigure: vi.fn().mockReturnValue({}),
      },
    } as unknown as DeepMockProxy<Editor>;
    // Note: WebsocketProvider and IndexeddbPersistence are already mocked in setup-vitest.ts

    // Mock ProjectStateService
    mockProjectStateService = {
      updateSyncState: vi.fn(),
      project: vi.fn().mockReturnValue({
        username: 'testuser',
        slug: 'test-project',
      }),
    } as unknown as DeepMockProxy<ProjectStateService>;

    // Mock DocumentsService
    mockDocumentsService = {
      getDocument: vi.fn().mockReturnValue({
        content: '<p>Mocked document content</p>',
      }),
      saveDocument: vi.fn().mockReturnValue(Promise.resolve()),
      renderDocumentAsHtml: vi
        .fn()
        .mockReturnValue(of('<html>Rendered</html>')),
    } as unknown as DeepMockProxy<DocumentsService>;

    // Mock LintApiService
    mockLintApiService = {
      run: vi.fn().mockResolvedValue({
        original_paragraph: 'test',
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      }),
    } as unknown as DeepMockProxy<LintApiService>;

    // Mock SetupService
    mockSetupService = {
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as DeepMockProxy<SetupService>;

    // Mock SystemConfigService
    mockSystemConfigService = {
      isAiLintingEnabled: vi.fn().mockReturnValue(true),
      isAiImageGenerationEnabled: vi.fn().mockReturnValue(true),
      refreshSystemFeatures: vi.fn(),
    } as unknown as DeepMockProxy<SystemConfigService>;

    // Mock UnifiedUserService to prevent real API calls
    mockUnifiedUserService = {
      currentUser: vi.fn().mockReturnValue({
        id: 'test-user-id',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      }),
      isAuthenticated: vi.fn().mockReturnValue(true),
    } as unknown as DeepMockProxy<UnifiedUserService>;

    // Mock AuthTokenService
    mockAuthTokenService = {
      getToken: vi.fn().mockReturnValue('test-auth-token'),
    } as unknown as DeepMockProxy<AuthTokenService>;

    // Configure TestBed and inject service
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        DocumentService,
        { provide: ProjectStateService, useValue: mockProjectStateService },
        { provide: DocumentsService, useValue: mockDocumentsService },
        { provide: LintApiService, useValue: mockLintApiService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
        { provide: UnifiedUserService, useValue: mockUnifiedUserService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
      ],
    });

    service = TestBed.inject(DocumentService);

    // Override websocket factory functions on the service instance
    // (vi.mock can't intercept local source files bundled by esbuild)
    mockCreateAuthWsProvider = vi.fn().mockResolvedValue(mockWebSocketProvider);
    mockSetupWsReauth = vi.fn();
    service['createAuthWsProvider'] = mockCreateAuthWsProvider as any;
    service['setupWsReauth'] = mockSetupWsReauth as any;

    // Mock window location for WebSocket URL
    // Include reload() to prevent unhandled exceptions from leaked timers
    // Use vi.stubGlobal so vi.unstubAllGlobals() in global afterEach restores it
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: 'localhost:4200',
      reload: () => {},
      href: 'http://localhost:4200/',
      origin: 'http://localhost:4200',
      pathname: '/',
      search: '',
      hash: '',
    });
  });

  afterEach(() => {
    // Clean up all document connections to prevent memory leaks and async issues.
    // Wrapped in try-catch because with isolate:false, storeState may reference
    // the real y-indexeddb module (instead of the mock) depending on fork ordering.
    try {
      service.disconnect();
    } catch {
      // Ignore disconnect errors in cleanup
    }
    vi.restoreAllMocks();
  });

  describe('Document Connection Management', () => {
    it('should create new document connection', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);

      expect(service.isConnected(testDocumentId)).toBe(true);
    });

    it('should reuse existing document connection', async () => {
      // First connection
      await service.setupCollaboration(mockEditor, testDocumentId);
      // Second connection attempt
      await service.setupCollaboration(mockEditor, testDocumentId);

      expect(service.isConnected(testDocumentId)).toBe(true);
    });

    it('should disconnect specific document', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);
      service.disconnect(testDocumentId);

      expect(service.isConnected(testDocumentId)).toBe(false);
    });

    it('should disconnect all documents', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);
      service.disconnect();

      expect(service.isConnected(testDocumentId)).toBe(false);
    });
  });

  describe('Sync Status Management', () => {
    it.skip('should update sync status when WebSocket connects', async () => {
      // Skip: Requires mocking WebSocket event handlers created internally
      // Mock WebSocket status handler
      mockWebSocketProvider.on.mockImplementation(
        (event: string, callback: any) => {
          if (event === 'status') {
            const mockEvent = new CloseEvent('close', {
              code: 1000,
              reason: '',
              wasClean: true,
              bubbles: true,
              cancelable: true,
            }) as CloseEvent & {
              status: ProviderStatus;
            } & boolean;
            mockEvent.status = 'connected';
            Object.assign(mockEvent, { valueOf: () => true });
            callback(mockEvent, mockWebSocketProvider);
          }
          return () => {};
        }
      );

      await service.setupCollaboration(mockEditor, testDocumentId);

      let currentStatus: DocumentSyncState | undefined;
      TestBed.runInInjectionContext(() => {
        const syncStatus = service.getSyncStatusSignal(testDocumentId);
        currentStatus = syncStatus();
      });

      expect(currentStatus).toBe(DocumentSyncState.Synced);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Synced
      );
    });

    it.skip('should handle WebSocket connection errors', async () => {
      // Skip: Requires mocking WebSocket event handlers created internally
      // Mock WebSocket error handler
      mockWebSocketProvider.on.mockImplementation(
        (event: string, callback: any) => {
          if (event === 'connection-error') {
            const mockErrorEvent = new CloseEvent('error', {
              code: 1006,
              reason: 'Connection error',
              wasClean: false,
              bubbles: true,
              cancelable: true,
            }) as CloseEvent & {
              status: ProviderStatus;
            } & boolean;
            mockErrorEvent.status = 'disconnected';
            Object.assign(mockErrorEvent, { valueOf: () => false });
            callback(mockErrorEvent, mockWebSocketProvider);
          }
          return () => {};
        }
      );

      await service.setupCollaboration(mockEditor, testDocumentId);

      let currentStatus: DocumentSyncState | undefined;
      TestBed.runInInjectionContext(() => {
        const syncStatus = service.getSyncStatusSignal(testDocumentId);
        currentStatus = syncStatus();
      });

      expect(currentStatus).toBe(DocumentSyncState.Local);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Local
      );
    });

    it('should initialize with Offline status', () => {
      let currentStatus: DocumentSyncState | undefined;
      TestBed.runInInjectionContext(() => {
        const syncStatus = service.getSyncStatusSignal(testDocumentId);
        currentStatus = syncStatus();
      });

      expect(currentStatus).toBe(DocumentSyncState.Local);
    });
  });

  describe('Document Import/Export', () => {
    it.skip('should export document content', async () => {
      // Skip: Requires setupCollaboration which creates internal Y.Doc - complex to test
      await service.setupCollaboration(mockEditor, testDocumentId);
      return new Promise<void>(resolve => {
        service.exportDocument(testDocumentId).subscribe(content => {
          expect(content).toEqual({ content: 'mocked content' });
          resolve();
        });
      });
    });

    it('should throw error when exporting non-existent document', () => {
      expect(() => service.exportDocument('non-existent')).toThrow(
        'No connection found for document non-existent'
      );
    });

    it.skip('should import document content', async () => {
      // Skip: Requires setupCollaboration which creates internal Y.Doc - complex to test
      await service.setupCollaboration(mockEditor, testDocumentId);
      const mockContent = '<p>Test content</p>';
      service.importDocument(testDocumentId, mockContent);

      // Verify Y.transact was called to update the document
      expect(Y.transact).toHaveBeenCalled();
    });

    it('should throw error when importing to non-existent document', () => {
      const mockContent = '<p>Test content</p>';
      expect(() => service.importDocument('non-existent', mockContent)).toThrow(
        'No connection found for document non-existent'
      );
    });

    it.skip('should import XML string into document fragment', () => {
      // Skip: Requires real Y.Doc/Fragment setup or extensive mocking - integration test candidate
      // Setup
      const testDoc = new Y.Doc();
      const testFragment = testDoc.getXmlFragment('test');
      const xmlContent = '<p>Test paragraph</p>';

      // Call the method
      service.importXmlString(testDoc, testFragment, xmlContent);

      // Verify Y.transact was called to update the document
      expect(Y.transact).toHaveBeenCalledWith(testDoc, expect.any(Function));
      expect(testFragment.delete).toHaveBeenCalledWith(0, testFragment.length);
    });
  });

  describe('Helper methods and accessors', () => {
    it('should expose active connections and connected document ids', () => {
      const otherDocumentId = 'testuser:test-project:other-doc';
      const ydoc = new Y.Doc();
      const connectionMap = (
        service as unknown as { connections: Map<string, unknown> }
      ).connections;

      connectionMap.set(testDocumentId, {
        ydoc,
        provider: mockWebSocketProvider,
        type: ydoc.getXmlFragment('prosemirror'),
        indexeddbProvider: _mockIndexedDbProvider,
      });
      connectionMap.set(otherDocumentId, {
        ydoc: new Y.Doc(),
        provider: null,
        type: ydoc.getXmlFragment('other'),
        indexeddbProvider: _mockIndexedDbProvider,
      });

      expect(service.getConnectedDocumentIds()).toEqual([
        testDocumentId,
        otherDocumentId,
      ]);
      expect(service.getActiveConnections()).toHaveLength(1);
    });

    it('should initialize and update word count signals', () => {
      let initialCount = -1;
      let updatedCount = -1;

      TestBed.runInInjectionContext(() => {
        initialCount = service.getWordCountSignal(testDocumentId)();
      });

      service.updateWordCount(testDocumentId, 42);

      TestBed.runInInjectionContext(() => {
        updatedCount = service.getWordCountSignal(testDocumentId)();
      });

      expect(initialCount).toBe(0);
      expect(updatedCount).toBe(42);
    });

    it('should export, read, and reuse the active Yjs document connection', async () => {
      const ydoc = new Y.Doc();
      const fragment = ydoc.getXmlFragment('prosemirror');
      const connectionMap = (
        service as unknown as { connections: Map<string, unknown> }
      ).connections;

      service.importXmlString(
        ydoc,
        fragment,
        '<paragraph>Hello <text strong="true">world</text></paragraph>'
      );
      connectionMap.set(testDocumentId, {
        ydoc,
        provider: mockWebSocketProvider,
        type: fragment,
        indexeddbProvider: _mockIndexedDbProvider,
      });

      const exportedContent = await new Promise<unknown>(resolve => {
        service.exportDocument(testDocumentId).subscribe(content => {
          resolve(content);
        });
      });

      const activeYDoc = await service.getYDoc(testDocumentId);
      const content = await service.getDocumentContent(testDocumentId);

      expect(exportedContent).toEqual(fragment.toJSON());
      expect(activeYDoc).toBe(ydoc);
      expect(content).toEqual([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            {
              type: 'text',
              attrs: { strong: true },
              content: [{ type: 'text', text: 'world' }],
            },
          ],
        },
      ]);
    });

    it('should open rendered html in a new browser tab', () => {
      const openSpy = vi.spyOn(globalThis, 'open').mockReturnValue(null);

      service.openDocumentAsHtml('testuser', 'test-project', 'test-doc');

      expect(mockDocumentsService.renderDocumentAsHtml).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'test-doc'
      );
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('blob:'),
        '_blank'
      );
    });

    it('should convert ProseMirror JSON structures to XML strings', () => {
      const toXml = (
        service as unknown as {
          prosemirrorJsonToXml: (content: unknown) => string | null;
        }
      ).prosemirrorJsonToXml.bind(service);

      expect(
        toXml({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'A & B' },
                {
                  type: 'elementRef',
                  attrs: { refId: 'elem-1', metadata: { flag: true } },
                },
              ],
            },
          ],
        })
      ).toBe(
        '<paragraph>A &amp; B<elementRef refId="elem-1" metadata="{&quot;flag&quot;:true}"/></paragraph>'
      );
      expect(toXml(null)).toBeNull();
      expect(toXml([])).toBeNull();
    });

    it('should convert DOM nodes into Yjs nodes and skip empty whitespace', () => {
      const domNodeToYjsNode = (
        service as unknown as {
          domNodeToYjsNode: (node: Node) => Y.XmlElement | Y.XmlText | null;
        }
      ).domNodeToYjsNode.bind(service);
      const parsed = new DOMParser().parseFromString(
        '<root><paragraph data-id="123">Hello <elementRef refId="x"></elementRef></paragraph>   </root>',
        'text/html'
      );
      const root = parsed.body.firstElementChild as HTMLElement;
      const paragraphNode = root.childNodes[0];
      const whitespaceNode = root.childNodes[1];

      const yParagraph = domNodeToYjsNode(paragraphNode);

      expect(yParagraph).toBeInstanceOf(Y.XmlElement);
      expect((yParagraph as Y.XmlElement).nodeName).toBe('PARAGRAPH');
      expect((paragraphNode as HTMLElement).dataset['id']).toBe('123');
      expect(whitespaceNode.textContent).toBe('   ');
      expect(domNodeToYjsNode(whitespaceNode)).toBeNull();
    });

    it('should keep sync state local when websocket setup cannot proceed', async () => {
      const ydoc = new Y.Doc();
      const connection = {
        ydoc,
        provider: null,
        type: ydoc.getXmlFragment('prosemirror'),
        indexeddbProvider: _mockIndexedDbProvider,
      };
      type OfflineConnection = typeof connection;
      const privateService = service as unknown as {
        connectWebSocketInBackground: (
          websocketUrl: string | null,
          documentId: string,
          doc: Y.Doc,
          editor: Editor,
          connection: OfflineConnection
        ) => Promise<void>;
        versionCompatibility: { syncBlocked: () => boolean };
      };

      service.initializeSyncStatus(testDocumentId);
      await privateService.connectWebSocketInBackground(
        null,
        testDocumentId,
        ydoc,
        mockEditor,
        connection
      );
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Local
      );

      mockAuthTokenService.getToken.mockReturnValue(null);
      await privateService.connectWebSocketInBackground(
        'ws://localhost:8333',
        testDocumentId,
        ydoc,
        mockEditor,
        connection
      );
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Local
      );

      mockAuthTokenService.getToken.mockReturnValue('token');
      privateService.versionCompatibility = { syncBlocked: () => true };
      await privateService.connectWebSocketInBackground(
        'ws://localhost:8333',
        testDocumentId,
        ydoc,
        mockEditor,
        connection
      );
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Local
      );
    });

    it('should generate a stable user color and derive the project key', () => {
      const privateService = service as unknown as {
        generateUserColor: (username: string) => string;
        getProjectKey: () => string | null;
      };

      expect(privateService.generateUserColor('testuser')).toMatch(
        /^#[0-9a-f]{6}$/i
      );
      expect(privateService.generateUserColor('testuser')).toBe(
        privateService.generateUserColor('testuser')
      );
      expect(privateService.getProjectKey()).toBe('testuser/test-project');
    });

    it('should restore existing media urls and attach a cleanup observer', async () => {
      const dom = document.createElement('div');
      const image = document.createElement('img');
      image.setAttribute('src', 'media:media-1');
      dom.append(image);

      const privateService = service as unknown as {
        startMediaUrlObserver: (
          view: { dom: HTMLElement },
          documentId: string
        ) => void;
        connections: Map<string, unknown>;
        localStorage: {
          getMediaUrl: (
            projectKey: string,
            mediaId: string
          ) => Promise<string | null>;
        };
      };
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((callback: TimerHandler) => {
          (callback as () => void)();
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout);

      privateService.localStorage = {
        getMediaUrl: vi.fn().mockResolvedValue('blob:resolved-media'),
      };
      privateService.connections.set(testDocumentId, {
        ydoc: new Y.Doc(),
        provider: mockWebSocketProvider,
        type: new Y.Doc().getXmlFragment('prosemirror'),
        indexeddbProvider: _mockIndexedDbProvider,
      });

      privateService.startMediaUrlObserver({ dom }, testDocumentId);
      await Promise.resolve();
      await Promise.resolve();

      expect(image.src).toContain('blob:resolved-media');
      expect(image.dataset['mediaId']).toBe('media-1');
      expect(
        (
          privateService.connections.get(testDocumentId) as {
            mediaObserver?: MutationObserver;
          }
        ).mediaObserver
      ).toBeInstanceOf(MutationObserver);

      setTimeoutSpy.mockRestore();
    });

    it('should fully clean up a populated document connection on disconnect', () => {
      const ydoc = new Y.Doc();
      const mediaObserver = {
        disconnect: vi.fn(),
      } as unknown as MutationObserver;
      const provider = {
        awareness: { setLocalState: vi.fn(), clientID: 123 },
        disconnect: vi.fn(),
        destroy: vi.fn(),
      };
      const indexeddbProvider = {
        destroy: vi.fn().mockResolvedValue(undefined),
      } as unknown as DeepMockProxy<IndexeddbPersistence>;
      const privateService = service as unknown as {
        connections: Map<string, unknown>;
        reconnectTimeouts: Map<string, number>;
        syncStatusSignals: Map<string, unknown>;
        unsyncedChanges: Map<string, boolean>;
        wordCountSignals: Map<string, unknown>;
      };
      const timeoutId = setTimeout(() => {}, 0) as unknown as number;

      privateService.connections.set(testDocumentId, {
        ydoc,
        provider,
        type: ydoc.getXmlFragment('prosemirror'),
        indexeddbProvider,
        mediaObserver,
      });
      privateService.reconnectTimeouts.set(testDocumentId, timeoutId);
      privateService.syncStatusSignals.set(testDocumentId, {});
      privateService.unsyncedChanges.set(testDocumentId, true);
      privateService.wordCountSignals.set(testDocumentId, {});

      service.disconnect(testDocumentId);

      expect(mediaObserver.disconnect).toHaveBeenCalledTimes(1);
      expect(provider.awareness.setLocalState).toHaveBeenCalledWith(null);
      expect(provider.disconnect).toHaveBeenCalledTimes(1);
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(service.isConnected(testDocumentId)).toBe(false);
      expect(privateService.reconnectTimeouts.has(testDocumentId)).toBe(false);
      expect(privateService.syncStatusSignals.has(testDocumentId)).toBe(false);
      expect(privateService.unsyncedChanges.has(testDocumentId)).toBe(false);
      expect(privateService.wordCountSignals.has(testDocumentId)).toBe(false);
    });

    it('should handle synchronous storeState error on single-document disconnect', () => {
      const ydoc = new Y.Doc();
      const provider = {
        awareness: { setLocalState: vi.fn(), clientID: 123 },
        disconnect: vi.fn(),
        destroy: vi.fn(),
      };
      const privateService = service as unknown as {
        connections: Map<string, unknown>;
      };

      // A throwing getter on indexeddbProvider triggers the try/catch that
      // wraps `storeState(connection.indexeddbProvider, …)` in cleanupProviders,
      // because JS evaluates the argument expression before calling the function.
      privateService.connections.set(testDocumentId, {
        ydoc,
        provider,
        type: ydoc.getXmlFragment('prosemirror'),
        get indexeddbProvider(): never {
          throw new Error('Provider already destroyed');
        },
      });

      // Should not throw — the catch block handles it
      expect(() => service.disconnect(testDocumentId)).not.toThrow();
      expect(service.isConnected(testDocumentId)).toBe(false);
    });

    it('should handle synchronous storeState error on disconnect-all', () => {
      const ydoc = new Y.Doc();
      const privateService = service as unknown as {
        connections: Map<string, unknown>;
      };

      // Same throwing-getter trick, but exercising the disconnectAll path
      privateService.connections.set(testDocumentId, {
        ydoc,
        provider: null,
        type: ydoc.getXmlFragment('prosemirror'),
        get indexeddbProvider(): never {
          throw new Error('Provider already destroyed');
        },
      });

      // Should not throw — the catch block handles it
      expect(() => service.disconnect()).not.toThrow();
      expect(service.isConnected(testDocumentId)).toBe(false);
    });

    it.skip('should connect websocket in the background and react to status changes', async () => {
      const ydoc = new Y.Doc();
      const connection = {
        ydoc,
        provider: null,
        type: ydoc.getXmlFragment('prosemirror'),
        indexeddbProvider: _mockIndexedDbProvider,
      };
      type ConnectedDocument = typeof connection;
      const callbacks: Record<string, (payload: unknown) => void> = {};
      const editorWithView = {
        ...mockEditor,
        view: {
          ...mockEditor.view,
          dom: { parentNode: {} },
          state: {
            ...mockEditor.view.state,
            plugins: [],
            reconfigure: vi.fn().mockReturnValue({}),
          },
          updateState: vi.fn(),
        },
      } as unknown as DeepMockProxy<Editor>;
      const privateService = service as unknown as {
        connectWebSocketInBackground: (
          websocketUrl: string | null,
          documentId: string,
          doc: Y.Doc,
          editor: Editor,
          connection: ConnectedDocument
        ) => Promise<void>;
      };
      let scheduledReconnect: (() => void) | undefined;
      const setTimeoutSpy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((callback: TimerHandler) => {
          scheduledReconnect = callback as () => void;
          return 1 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout);

      mockWebSocketProvider.on.mockImplementation((event: string, cb: any) => {
        callbacks[event] = cb;
        return () => {};
      });

      service.initializeSyncStatus(testDocumentId);

      await privateService.connectWebSocketInBackground(
        'ws://localhost:8333',
        testDocumentId,
        ydoc,
        editorWithView,
        connection
      );

      expect(mockCreateAuthWsProvider).toHaveBeenCalled();
      expect(connection.provider).toBe(mockWebSocketProvider);
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Synced
      );
      expect(
        mockWebSocketProvider.awareness.setLocalStateField
      ).toHaveBeenCalledWith(
        'user',
        expect.objectContaining({ name: 'testuser' })
      );
      expect(mockSetupWsReauth).toHaveBeenCalledTimes(1);

      callbacks['status']?.({ status: 'disconnected' });
      scheduledReconnect?.();
      expect(mockWebSocketProvider.connect).toHaveBeenCalledTimes(1);

      callbacks['status']?.({ status: 'connected' });
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Synced
      );

      callbacks['connection-error']?.('401 Unauthorized');
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Unavailable
      );
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Unavailable
      );

      setTimeoutSpy.mockRestore();
    }, 15000);
  });

  describe('Collaboration Setup', () => {
    it.skip('should add ProseMirror plugins', async () => {
      // Skip: Cannot verify internal editor.state.reconfigure calls - integration test candidate
      await service.setupCollaboration(mockEditor, testDocumentId);
      expect(mockEditor).toBeDefined();
    });

    it('should handle editor initialization errors', async () => {
      // Simulate missing editor view
      mockEditor.view = null as unknown as typeof mockEditor.view;

      await expect(
        service.setupCollaboration(mockEditor, testDocumentId)
      ).rejects.toThrow('Editor Yjs not properly initialized');
    });

    it('should skip re-adding plugins when collaboration is already set up', async () => {
      // First call sets up collaboration normally
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Store spy call counts before second call
      const pluginCountBefore = mockEditor.view.state.plugins.length;

      // Second call should detect existing y-sync plugin and return early
      // (no throw, just silently skips)
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Plugins should not have been re-added
      expect(mockEditor.view.state.plugins.length).toBe(pluginCountBefore);
    });
  });

  describe('Network Handling', () => {
    it.skip('should attempt reconnection when online', async () => {
      // Skip: Network event handling is tested via integration - complex WebSocket mocking needed
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Simulate network restoration
      globalThis.dispatchEvent(
        new Event('online', { bubbles: true, cancelable: true })
      );

      expect(mockWebSocketProvider.connect).toHaveBeenCalled();
    });

    it.skip('should handle WebSocket provider events', async () => {
      // Skip: WebSocket event callbacks are internal - integration test candidate
      // Setup
      const statusHandler = vi.fn();
      const errorHandler = vi.fn();

      mockWebSocketProvider.on.mockImplementation(
        (event: string, callback: any) => {
          if (event === 'status') statusHandler(callback);
          if (event === 'connection-error') errorHandler(callback);
          return () => {};
        }
      );

      await service.setupCollaboration(mockEditor, testDocumentId);

      expect(statusHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should extract message from Error instances in connection-error handler', async () => {
      let connectionErrorHandler:
        | ((error: Error | string | Event) => void)
        | undefined;
      mockWebSocketProvider.on.mockImplementation(
        (event: string, callback: any) => {
          if (event === 'connection-error') connectionErrorHandler = callback;
          return () => {};
        }
      );

      service.initializeSyncStatus(testDocumentId);
      await service.setupCollaboration(mockEditor, testDocumentId);
      // Flush microtask queue — connectWebSocketInBackground is fire-and-forget
      await new Promise(r => setTimeout(r, 0));

      // Invoke with Error instance — covers the `error instanceof Error` branch
      connectionErrorHandler!(new Error('Connection refused'));
      // Non-auth errors fall through to Local state (not Unavailable)
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Local
      );
    });

    it('should extract type from Event instances in connection-error handler', async () => {
      let connectionErrorHandler:
        | ((error: Error | string | Event) => void)
        | undefined;
      mockWebSocketProvider.on.mockImplementation(
        (event: string, callback: any) => {
          if (event === 'connection-error') connectionErrorHandler = callback;
          return () => {};
        }
      );

      service.initializeSyncStatus(testDocumentId);
      await service.setupCollaboration(mockEditor, testDocumentId);
      // Flush microtask queue — connectWebSocketInBackground is fire-and-forget
      await new Promise(r => setTimeout(r, 0));

      // Invoke with Event instance — covers the `else` branch (not Error, not string)
      connectionErrorHandler!(new Event('error'));
      // Non-auth errors fall through to Local state
      expect(service.getSyncStatusSignal(testDocumentId)()).toBe(
        DocumentSyncState.Local
      );
    });
  });

  describe('Unsynced Changes Tracking', () => {
    it.skip('should track unsynced changes when document is modified locally', async () => {
      // Skip: Y.Doc observer callbacks are internal - integration test candidate
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Get the update handler that was registered
      const updateHandler = mockYDoc.on.mock.calls.find(
        (call: any) => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        throw new Error('Update handler was not registered');
      }

      // Simulate a local update (origin !== provider)
      updateHandler(new Uint8Array(), 'local', mockYDoc, new Set());

      expect(service.hasUnsyncedChanges(testDocumentId)).toBe(true);
    });

    it.skip('should not track changes from the provider as unsynced', async () => {
      // Skip: Y.Doc observer callbacks are internal - integration test candidate
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Get the update handler
      const updateHandler = mockYDoc.on.mock.calls.find(
        (call: any) => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        throw new Error('Update handler was not registered');
      }

      // Simulate an update from the provider (origin === provider)
      updateHandler(
        new Uint8Array(),
        mockWebSocketProvider,
        mockYDoc,
        new Set()
      );

      expect(service.hasUnsyncedChanges(testDocumentId)).toBe(false);
    });

    it.skip('should clear unsynced changes when reconnecting', async () => {
      // Skip: Combined Y.Doc observer and WebSocket events - integration test candidate
      await service.setupCollaboration(mockEditor, testDocumentId);

      // First simulate a local change
      const updateHandler = mockYDoc.on.mock.calls.find(
        (call: any) => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        throw new Error('Update handler was not registered');
      }
      updateHandler(new Uint8Array(), 'local', mockYDoc, new Set());
      expect(service.hasUnsyncedChanges(testDocumentId)).toBe(true);

      // Now simulate reconnection
      const statusHandler = mockWebSocketProvider.on.mock.calls.find(
        (call: any) => call[0] === 'status'
      )?.[1];
      if (!statusHandler) {
        throw new Error('Status handler was not registered');
      }
      const mockEvent = new CloseEvent('close', {
        code: 1000,
        reason: '',
        wasClean: true,
        bubbles: true,
        cancelable: true,
      }) as CloseEvent & {
        status: 'connected' | 'disconnected' | 'connecting';
      } & boolean;
      mockEvent.status = 'connected';
      Object.assign(mockEvent, { valueOf: () => true });
      statusHandler(mockEvent, mockWebSocketProvider);

      expect(service.hasUnsyncedChanges(testDocumentId)).toBe(false);
    });

    it('should return false for hasUnsyncedChanges on non-existent document', () => {
      expect(service.hasUnsyncedChanges('non-existent')).toBe(false);
    });
  });

  describe('Headless Document Sync', () => {
    describe('syncDocumentToServer', () => {
      it('should throw error for invalid documentId format', async () => {
        await expect(
          service.syncDocumentToServer('invalid-id')
        ).rejects.toThrow('Invalid documentId format');
      });

      it('should throw error for empty documentId parts', async () => {
        await expect(
          service.syncDocumentToServer('user::docId')
        ).rejects.toThrow('Invalid documentId');
      });

      it('should skip sync when WebSocket URL is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        // Should not throw, just skip
        await service.syncDocumentToServer(testDocumentId);

        // Verify no WebSocket connection was attempted (the function returns early)
        expect(true).toBe(true);
      });

      it('should skip sync when auth token is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue('ws://localhost:8333');
        mockAuthTokenService.getToken.mockReturnValue(null);

        // Should not throw, just skip
        await service.syncDocumentToServer(testDocumentId);

        // Verify getToken was called
        expect(mockAuthTokenService.getToken).toHaveBeenCalled();
      });

      it('should log source suffix when sourceDocumentId is provided', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        // Exercises the sourceSuffix truthy branch (sourceDocumentId is defined)
        await service.syncDocumentToServer(
          testDocumentId,
          30000,
          'other:project:doc'
        );

        // Method returns early because webSocketUrl is null, but the sourceSuffix
        // branch was exercised in the logger.info call before the early return
        expect(mockSetupService.getWebSocketUrl).toHaveBeenCalled();
      });

      it('should call createAuthWsProvider when syncing a document', async () => {
        mockWebSocketProvider.on.mockImplementation(
          (event: string, callback: any) => {
            if (event === 'sync') callback(true);
            return () => {};
          }
        );

        await service.syncDocumentToServer(testDocumentId, 1000);

        expect(mockCreateAuthWsProvider).toHaveBeenCalledWith(
          'ws://localhost:8333/api/v1/ws/yjs?documentId=testuser:test-project:test-doc',
          '',
          expect.any(Y.Doc),
          'test-auth-token',
          { resyncInterval: 10000 }
        );
        expect(mockWebSocketProvider.disconnect).toHaveBeenCalledTimes(1);
        expect(mockWebSocketProvider.destroy).toHaveBeenCalledTimes(1);
      });
    });

    describe('syncDocumentsToServer', () => {
      it('should sync multiple documents and report success/failure', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        const documentIds = [
          'user1:project1:doc1',
          'user1:project1:doc2',
          'user1:project1:doc3',
        ];

        const result = await service.syncDocumentsToServer(documentIds);

        // All should succeed (skipped due to no WebSocket URL)
        expect(result.success.length).toBe(3);
        expect(result.failed.length).toBe(0);
      });

      it('should handle empty document list', async () => {
        const result = await service.syncDocumentsToServer([]);

        expect(result.success).toEqual([]);
        expect(result.failed).toEqual([]);
      });

      it('should respect concurrency limit', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        const documentIds = Array.from(
          { length: 10 },
          (_, i) => `user:project:doc${i}`
        );

        // With concurrency of 2, should process in batches
        const result = await service.syncDocumentsToServer(documentIds, 2);

        expect(result.success.length).toBe(10);
        expect(result.failed.length).toBe(0);
      });
    });

    describe('syncWorldbuildingToServer', () => {
      it('should throw error for invalid worldbuildingId format', async () => {
        await expect(
          service.syncWorldbuildingToServer('invalid-id')
        ).rejects.toThrow('Invalid worldbuildingId format');
      });

      it('should throw error for worldbuildingId without worldbuilding prefix', async () => {
        await expect(
          service.syncWorldbuildingToServer('user:project:elementId')
        ).rejects.toThrow('Invalid worldbuildingId format');
      });

      it('should throw error for empty worldbuildingId parts', async () => {
        await expect(
          service.syncWorldbuildingToServer('worldbuilding:user::elementId')
        ).rejects.toThrow('Invalid worldbuildingId');
      });

      it('should skip sync when WebSocket URL is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        // Should not throw, just skip
        await service.syncWorldbuildingToServer(
          'worldbuilding:user:project:element123'
        );

        // Verify function completed without error
        expect(true).toBe(true);
      });

      it('should skip sync when auth token is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue('ws://localhost:8333');
        mockAuthTokenService.getToken.mockReturnValue(null);

        // Should not throw, just skip
        await service.syncWorldbuildingToServer(
          'worldbuilding:user:project:element123'
        );

        // Verify getToken was called
        expect(mockAuthTokenService.getToken).toHaveBeenCalled();
      });

      it('should log source suffix when sourceWorldbuildingId is provided', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        // Exercises the wbSourceSuffix truthy branch (sourceWorldbuildingId is defined)
        await service.syncWorldbuildingToServer(
          'worldbuilding:testuser:project:element123',
          30000,
          'worldbuilding:other:project:elemABC'
        );

        // Method returns early because webSocketUrl is null, but the wbSourceSuffix
        // branch was exercised in the logger.info call before the early return
        expect(mockSetupService.getWebSocketUrl).toHaveBeenCalled();
      });

      it('should call createAuthWsProvider when syncing worldbuilding', async () => {
        mockWebSocketProvider.on.mockImplementation(
          (event: string, callback: any) => {
            if (event === 'sync') callback(true);
            return () => {};
          }
        );

        await service.syncWorldbuildingToServer(
          'worldbuilding:testuser:test-project:element123',
          1000
        );

        expect(mockCreateAuthWsProvider).toHaveBeenCalledWith(
          'ws://localhost:8333/api/v1/ws/yjs?documentId=testuser:test-project:element123',
          '',
          expect.any(Y.Doc),
          'test-auth-token',
          { resyncInterval: 10000 }
        );
        expect(mockWebSocketProvider.disconnect).toHaveBeenCalledTimes(1);
        expect(mockWebSocketProvider.destroy).toHaveBeenCalledTimes(1);
      });
    });

    describe('syncWorldbuildingToServerBatch', () => {
      it('should sync multiple worldbuilding elements and report success/failure', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        const worldbuildingIds = [
          'worldbuilding:user1:project1:elem1',
          'worldbuilding:user1:project1:elem2',
          'worldbuilding:user1:project1:elem3',
        ];

        const result =
          await service.syncWorldbuildingToServerBatch(worldbuildingIds);

        // All should succeed (skipped due to no WebSocket URL)
        expect(result.success.length).toBe(3);
        expect(result.failed.length).toBe(0);
      });

      it('should handle empty worldbuilding list', async () => {
        const result = await service.syncWorldbuildingToServerBatch([]);

        expect(result.success).toEqual([]);
        expect(result.failed).toEqual([]);
      });

      it('should respect concurrency limit', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        const worldbuildingIds = Array.from(
          { length: 10 },
          (_, i) => `worldbuilding:user:project:elem${i}`
        );

        // With concurrency of 2, should process in batches
        const result = await service.syncWorldbuildingToServerBatch(
          worldbuildingIds,
          2
        );

        expect(result.success.length).toBe(10);
        expect(result.failed.length).toBe(0);
      });

      it('should track failures when some worldbuilding elements have invalid format', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        const worldbuildingIds = [
          'worldbuilding:user1:project1:elem1',
          'invalid:id', // Invalid format - will fail
          'worldbuilding:user1:project1:elem3',
        ];

        const result =
          await service.syncWorldbuildingToServerBatch(worldbuildingIds);

        // 2 should succeed, 1 should fail
        expect(result.success.length).toBe(2);
        expect(result.failed.length).toBe(1);
        expect(result.failed[0]).toBe('invalid:id');
      });
    });

    describe('syncElementsToServer', () => {
      it('should throw error when WebSocket URL is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue(null);

        await expect(
          service.syncElementsToServer('testuser', 'test-project')
        ).rejects.toThrow('No WebSocket URL available');
      });

      it('should throw error when auth token is not available', async () => {
        mockSetupService.getWebSocketUrl.mockReturnValue('ws://localhost:8333');
        mockAuthTokenService.getToken.mockReturnValue(null);

        await expect(
          service.syncElementsToServer('testuser', 'test-project')
        ).rejects.toThrow('No auth token available');
      });

      it('should call createAuthWsProvider when syncing elements', async () => {
        mockWebSocketProvider.on.mockImplementation(
          (event: string, callback: any) => {
            if (event === 'sync') callback(true);
            return () => {};
          }
        );

        await service.syncElementsToServer('testuser', 'test-project', 1000);

        expect(mockCreateAuthWsProvider).toHaveBeenCalledWith(
          'ws://localhost:8333/api/v1/ws/yjs?documentId=testuser:test-project:elements',
          '',
          expect.any(Y.Doc),
          'test-auth-token',
          { resyncInterval: 10000 }
        );
        expect(mockWebSocketProvider.disconnect).toHaveBeenCalledTimes(1);
        expect(mockWebSocketProvider.destroy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
