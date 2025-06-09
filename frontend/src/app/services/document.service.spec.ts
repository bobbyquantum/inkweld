import { DocumentAPIService } from '@inkweld/index';
import { createServiceFactory, SpectatorService } from '@ngneat/spectator/vitest';
import { Editor } from 'ngx-editor';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { LintApiService } from '../components/lint/lint-api.service';
import { DocumentSyncState } from '../models/document-sync-state';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';
import { SetupService } from './setup.service';
import { SystemConfigService } from './system-config.service';

// Mock dependencies
vi.mock('yjs', () => ({
  Doc: vi.fn(() => ({
    getXmlFragment: vi.fn(() => ({
      toJSON: vi.fn(() => ({ content: 'mocked content' })),
      insert: vi.fn(),
      delete: vi.fn(),
      push: vi.fn(),
      length: 10,
    })),
    destroy: vi.fn(),
    on: vi.fn(),
  })),
  XmlFragment: vi.fn(),
  XmlElement: vi.fn(() => ({
    insert: vi.fn(),
  })),
  XmlText: vi.fn(() => ({
    insert: vi.fn(),
  })),
  transact: vi.fn((doc, fn) => fn()),
}));
vi.mock('y-indexeddb');
vi.mock('y-websocket');
vi.mock('ngx-editor', () => ({
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
  let spectator: SpectatorService<DocumentService>;
  let mockProjectStateService: vi.Mocked<ProjectStateService>;
  let mockDocumentApiService: vi.Mocked<DocumentAPIService>;
  let mockLintApiService: vi.Mocked<LintApiService>;
  let mockYDoc: vi.Mocked<Y.Doc>;
  let mockWebSocketProvider: vi.Mocked<WebsocketProvider>;
  let mockIndexedDbProvider: vi.Mocked<IndexeddbPersistence>;
  let mockEditor: vi.Mocked<Editor>;
  let mockSetupService: vi.Mocked<SetupService>;
  let mockSystemConfigService: vi.Mocked<SystemConfigService>;

  const testDocumentId = 'test-doc';

  const createService = createServiceFactory({
    service: DocumentService,
  });

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Set up mock instances
    mockYDoc = new Y.Doc() as vi.Mocked<Y.Doc>;
    (Y.Doc as vi.Mock).mockImplementation(() => mockYDoc);
    mockWebSocketProvider = {
      on: vi.fn(),
      connect: vi.fn(),
      destroy: vi.fn(),
      awareness: {},
    } as unknown as vi.Mocked<WebsocketProvider>;
    mockIndexedDbProvider = {
      whenSynced: Promise.resolve(),
      destroy: vi.fn(),
    } as unknown as vi.Mocked<IndexeddbPersistence>;
    mockEditor = new Editor() as vi.Mocked<Editor>;

    // Mock constructors
    (WebsocketProvider as vi.Mock).mockImplementation(() => {
      return mockWebSocketProvider;
    });
    (IndexeddbPersistence as vi.Mock).mockImplementation(() => {
      return mockIndexedDbProvider;
    });

    // Mock ProjectStateService
    mockProjectStateService = {
      updateSyncState: vi.fn(),
    } as unknown as vi.Mocked<ProjectStateService>;

    // Mock DocumentAPIService
    mockDocumentApiService = {
      getDocument: vi.fn().mockReturnValue({
        content: '<p>Mocked document content</p>',
      }),
      saveDocument: vi.fn().mockReturnValue(Promise.resolve()),
    } as unknown as vi.Mocked<DocumentAPIService>;

    // Mock LintApiService
    mockLintApiService = {
      run: vi.fn().mockResolvedValue({
        original_paragraph: 'test',
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      }),
    } as unknown as vi.Mocked<LintApiService>;

    // Mock SetupService
    mockSetupService = {
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    } as unknown as vi.Mocked<SetupService>;

    // Mock SystemConfigService
    mockSystemConfigService = {
      isAiLintingEnabled: vi.fn().mockReturnValue(true),
      isAiImageGenerationEnabled: vi.fn().mockReturnValue(true),
      refreshSystemFeatures: vi.fn(),
    } as unknown as vi.Mocked<SystemConfigService>;

    // Configure TestBed and inject service
    spectator = createService({
      providers: [
        { provide: ProjectStateService, useValue: mockProjectStateService },
        { provide: DocumentAPIService, useValue: mockDocumentApiService },
        { provide: LintApiService, useValue: mockLintApiService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
      ],
    });

    // Mock window location for WebSocket URL
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:4200',
      },
      writable: true,
    });
  });

  describe('Document Connection Management', () => {
    it('should create new document connection', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      expect(spectator.service.isConnected(testDocumentId)).toBe(true);
      expect(mockYDoc.getXmlFragment).toHaveBeenCalledWith('prosemirror');
      expect(mockIndexedDbProvider.whenSynced).toBeTruthy();
      expect(mockWebSocketProvider.on).toHaveBeenCalledWith(
        'status',
        expect.any(Function)
      );
    });

    it('should reuse existing document connection', async () => {
      // First connection
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);
      // Second connection attempt
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      expect(mockYDoc.getXmlFragment).toHaveBeenCalledTimes(1);
      expect(mockIndexedDbProvider.whenSynced).toBeTruthy();
    });

    it('should disconnect specific document', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);
      spectator.service.disconnect(testDocumentId);

      expect(spectator.service.isConnected(testDocumentId)).toBe(false);
      expect(mockWebSocketProvider.destroy).toHaveBeenCalled();
      expect(mockIndexedDbProvider.destroy).toHaveBeenCalled();
      expect(mockYDoc.destroy).toHaveBeenCalled();
    });

    it('should disconnect all documents', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);
      spectator.service.disconnect();

      expect(spectator.service.isConnected(testDocumentId)).toBe(false);
      expect(mockWebSocketProvider.destroy).toHaveBeenCalled();
      expect(mockIndexedDbProvider.destroy).toHaveBeenCalled();
      expect(mockYDoc.destroy).toHaveBeenCalled();
    });
  });

  describe('Sync Status Management', () => {
    it('should update sync status when WebSocket connects', async () => {
      // Mock WebSocket status handler
      mockWebSocketProvider.on.mockImplementation((event, callback) => {
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
      });

      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      const syncStatus$ = spectator.service.getSyncStatus(testDocumentId);
      let currentStatus: DocumentSyncState | undefined;
      syncStatus$.subscribe(status => (currentStatus = status));

      expect(currentStatus).toBe(DocumentSyncState.Synced);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Synced
      );
    });

    it('should handle WebSocket connection errors', async () => {
      // Mock WebSocket error handler
      mockWebSocketProvider.on.mockImplementation((event, callback) => {
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
      });

      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      const syncStatus$ = spectator.service.getSyncStatus(testDocumentId);
      let currentStatus: DocumentSyncState | undefined;
      syncStatus$.subscribe(status => (currentStatus = status));

      expect(currentStatus).toBe(DocumentSyncState.Offline);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Offline
      );
    });

    it('should initialize with Offline status', () => {
      const syncStatus$ = spectator.service.getSyncStatus(testDocumentId);
      let currentStatus: DocumentSyncState | undefined;
      syncStatus$.subscribe(status => (currentStatus = status));

      expect(currentStatus).toBe(DocumentSyncState.Offline);
    });
  });

  describe('Document Import/Export', () => {
    beforeEach(async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);
    });

    it('should export document content', done => {
      spectator.service.exportDocument(testDocumentId).subscribe(content => {
        expect(content).toEqual({ content: 'mocked content' });
        done();
      });
    });

    it('should throw error when exporting non-existent document', () => {
      expect(() => spectator.service.exportDocument('non-existent')).toThrow(
        'No connection found for document non-existent'
      );
    });

    it('should import document content', () => {
      const mockContent = '<p>Test content</p>';
      spectator.service.importDocument(testDocumentId, mockContent);

      // Verify Y.transact was called to update the document
      expect(Y.transact).toHaveBeenCalled();
    });

    it('should throw error when importing to non-existent document', () => {
      const mockContent = '<p>Test content</p>';
      expect(() =>
        spectator.service.importDocument('non-existent', mockContent)
      ).toThrow('No connection found for document non-existent');
    });

    it('should import XML string into document fragment', () => {
      // Setup
      const testDoc = new Y.Doc();
      const testFragment = testDoc.getXmlFragment('test');
      const xmlContent = '<p>Test paragraph</p>';

      // Call the method
      spectator.service.importXmlString(testDoc, testFragment, xmlContent);

      // Verify Y.transact was called to update the document
      expect(Y.transact).toHaveBeenCalledWith(testDoc, expect.any(Function));
      expect(testFragment.delete).toHaveBeenCalledWith(0, testFragment.length);
    });
  });

  describe('Collaboration Setup', () => {
    it('should add ProseMirror plugins', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      expect(mockEditor.view.state.reconfigure).toHaveBeenCalledWith({
        plugins: expect.arrayContaining([
          expect.objectContaining({}),
        ]) as unknown,
      });
      expect(mockEditor.view.updateState).toHaveBeenCalled();
    });

    it('should handle editor initialization errors', async () => {
      // Simulate missing editor view
      mockEditor.view = null as unknown as typeof mockEditor.view;

      await expect(
        spectator.service.setupCollaboration(mockEditor, testDocumentId)
      ).rejects.toThrow('Editor Yjs not properly initialized');
    });

    it('should throw error when connection is not properly initialized', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      // Corrupt the connection by removing the type
      const connection = {
        provider: mockWebSocketProvider,
        ydoc: mockYDoc,
        indexeddbProvider: mockIndexedDbProvider,
        type: null,
      };

      // @ts-expect-error - Accessing private property for testing
      spectator.service['connections'].set(testDocumentId, connection);

      await expect(
        spectator.service.setupCollaboration(mockEditor, testDocumentId)
      ).rejects.toThrow('Editor Yjs not properly initialized');
    });
  });

  describe('Network Handling', () => {
    it('should attempt reconnection when online', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      // Simulate network restoration
      window.dispatchEvent(
        new Event('online', { bubbles: true, cancelable: true })
      );

      expect(mockWebSocketProvider.connect).toHaveBeenCalled();
    });

    it('should handle WebSocket provider events', async () => {
      // Setup
      const statusHandler = vi.fn();
      const errorHandler = vi.fn();

      mockWebSocketProvider.on.mockImplementation((event, callback) => {
        if (event === 'status') statusHandler(callback);
        if (event === 'connection-error') errorHandler(callback);
        return () => {};
      });

      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      expect(statusHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Unsynced Changes Tracking', () => {
    it('should track unsynced changes when document is modified locally', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      // Get the update handler that was registered
      const updateHandler = mockYDoc.on.mock.calls.find(
        call => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        fail('Update handler was not registered');
        return;
      }

      // Simulate a local update (origin !== provider)
      updateHandler(new Uint8Array(), 'local', mockYDoc, new Set());

      expect(spectator.service.hasUnsyncedChanges(testDocumentId)).toBe(true);
    });

    it('should not track changes from the provider as unsynced', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      // Get the update handler
      const updateHandler = mockYDoc.on.mock.calls.find(
        call => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        fail('Update handler was not registered');
        return;
      }

      // Simulate an update from the provider (origin === provider)
      updateHandler(
        new Uint8Array(),
        mockWebSocketProvider,
        mockYDoc,
        new Set()
      );

      expect(spectator.service.hasUnsyncedChanges(testDocumentId)).toBe(false);
    });

    it('should clear unsynced changes when reconnecting', async () => {
      await spectator.service.setupCollaboration(mockEditor, testDocumentId);

      // First simulate a local change
      const updateHandler = mockYDoc.on.mock.calls.find(
        call => call[0] === 'update'
      )?.[1] as any;
      if (!updateHandler) {
        fail('Update handler was not registered');
        return;
      }
      updateHandler(new Uint8Array(), 'local', mockYDoc, new Set());
      expect(spectator.service.hasUnsyncedChanges(testDocumentId)).toBe(true);

      // Now simulate reconnection
      const statusHandler = mockWebSocketProvider.on.mock.calls.find(
        call => call[0] === 'status'
      )?.[1];
      if (!statusHandler) {
        fail('Status handler was not registered');
        return;
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

      expect(spectator.service.hasUnsyncedChanges(testDocumentId)).toBe(false);
    });

    it('should return false for hasUnsyncedChanges on non-existent document', () => {
      expect(spectator.service.hasUnsyncedChanges('non-existent')).toBe(false);
    });
  });
});
