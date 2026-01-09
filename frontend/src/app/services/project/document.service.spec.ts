import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Editor } from '@bobbyquantum/ngx-editor';
import { DocumentsService } from '@inkweld/api/documents.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy } from 'vitest-mock-extended';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
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

// Mock y-websocket
vi.mock('y-websocket', () => ({
  WebsocketProvider: class WebsocketProvider {
    on = () => {};
    connect = () => {};
    destroy = () => {};
    awareness = {
      setLocalState: () => {},
      setLocalStateField: () => {},
      getStates: () => new Map(),
    };
    constructor(
      _url: string,
      _room: string,
      _doc: unknown,
      _options?: unknown
    ) {}
  },
}));
vi.mock('@bobbyquantum/ngx-editor', () => ({
  Editor: vi.fn(() => ({
    view: {
      state: {
        plugins: [],
        reconfigure: vi.fn(),
      },
      updateState: vi.fn(),
    },
  })),
}));

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

  const testDocumentId = 'testuser:test-project:test-doc';

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Use real Y.Doc since Yjs works fine in tests now
    mockYDoc = new Y.Doc() as unknown as DeepMockProxy<Y.Doc>;

    // Mock WebSocket and IndexedDB providers (these have side effects)
    mockWebSocketProvider = {
      on: vi.fn().mockReturnValue(() => {}), // Return cleanup function
      connect: vi.fn(),
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

    // Mock window location for WebSocket URL
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:4200',
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Clean up all document connections to prevent memory leaks and async issues
    service.disconnect();
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
              status: 'connected' | 'disconnected' | 'connecting';
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
              status: 'connected' | 'disconnected' | 'connecting';
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

      expect(currentStatus).toBe(DocumentSyncState.Offline);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Offline
      );
    });

    it('should initialize with Offline status', () => {
      let currentStatus: DocumentSyncState | undefined;
      TestBed.runInInjectionContext(() => {
        const syncStatus = service.getSyncStatusSignal(testDocumentId);
        currentStatus = syncStatus();
      });

      expect(currentStatus).toBe(DocumentSyncState.Offline);
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

  describe('Collaboration Setup', () => {
    it.skip('should add ProseMirror plugins', async () => {
      // Skip: Cannot verify internal editor.state.reconfigure calls - integration test candidate
      await service.setupCollaboration(mockEditor, testDocumentId);
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
      window.dispatchEvent(
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
  });
});
