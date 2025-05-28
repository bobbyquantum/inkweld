import { DocumentAPIService } from '@inkweld/index';
import { createServiceFactory, SpectatorService } from '@ngneat/spectator/jest';
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
jest.mock('yjs', () => ({
  Doc: jest.fn(() => ({
    getXmlFragment: jest.fn(() => ({
      toJSON: jest.fn(() => ({ content: 'mocked content' })),
      insert: jest.fn(),
      delete: jest.fn(),
      push: jest.fn(),
      length: 10,
    })),
    destroy: jest.fn(),
    on: jest.fn(),
  })),
  XmlFragment: jest.fn(),
  XmlElement: jest.fn(() => ({
    insert: jest.fn(),
  })),
  XmlText: jest.fn(() => ({
    insert: jest.fn(),
  })),
  transact: jest.fn((doc, fn) => fn()),
}));
jest.mock('y-indexeddb');
jest.mock('y-websocket');
jest.mock('ngx-editor', () => ({
  Editor: jest.fn(() => ({
    view: {
      state: {
        plugins: [],
        reconfigure: jest.fn(),
      },
      updateState: jest.fn(),
    },
  })),
}));

describe('DocumentService', () => {
  let spectator: SpectatorService<DocumentService>;
  let mockProjectStateService: jest.Mocked<ProjectStateService>;
  let mockDocumentApiService: jest.Mocked<DocumentAPIService>;
  let mockLintApiService: jest.Mocked<LintApiService>;
  let mockYDoc: jest.Mocked<Y.Doc>;
  let mockWebSocketProvider: jest.Mocked<WebsocketProvider>;
  let mockIndexedDbProvider: jest.Mocked<IndexeddbPersistence>;
  let mockEditor: jest.Mocked<Editor>;
  let mockSetupService: jest.Mocked<SetupService>;
  let mockSystemConfigService: jest.Mocked<SystemConfigService>;

  const testDocumentId = 'test-doc';

  const createService = createServiceFactory({
    service: DocumentService,
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Set up mock instances
    mockYDoc = new Y.Doc() as jest.Mocked<Y.Doc>;
    (Y.Doc as jest.Mock).mockImplementation(() => mockYDoc);
    mockWebSocketProvider = {
      on: jest.fn(),
      connect: jest.fn(),
      destroy: jest.fn(),
      awareness: {},
    } as unknown as jest.Mocked<WebsocketProvider>;
    mockIndexedDbProvider = {
      whenSynced: Promise.resolve(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<IndexeddbPersistence>;
    mockEditor = new Editor() as jest.Mocked<Editor>;

    // Mock constructors
    (WebsocketProvider as jest.Mock).mockImplementation(() => {
      return mockWebSocketProvider;
    });
    (IndexeddbPersistence as jest.Mock).mockImplementation(() => {
      return mockIndexedDbProvider;
    });

    // Mock ProjectStateService
    mockProjectStateService = {
      updateSyncState: jest.fn(),
    } as unknown as jest.Mocked<ProjectStateService>;

    // Mock DocumentAPIService
    mockDocumentApiService = {
      getDocument: jest.fn().mockReturnValue({
        content: '<p>Mocked document content</p>',
      }),
      saveDocument: jest.fn().mockReturnValue(Promise.resolve()),
    } as unknown as jest.Mocked<DocumentAPIService>;

    // Mock LintApiService
    mockLintApiService = {
      run: jest.fn().mockResolvedValue({
        original_paragraph: 'test',
        corrections: [],
        style_recommendations: [],
        source: 'openai',
      }),
    } as unknown as jest.Mocked<LintApiService>;

    // Mock SetupService
    mockSetupService = {
      getWebSocketUrl: jest.fn().mockReturnValue('ws://localhost:8333'),
    } as unknown as jest.Mocked<SetupService>;

    // Mock SystemConfigService
    mockSystemConfigService = {
      isAiLintingEnabled: jest.fn().mockReturnValue(true),
      isAiImageGenerationEnabled: jest.fn().mockReturnValue(true),
      refreshSystemFeatures: jest.fn(),
    } as unknown as jest.Mocked<SystemConfigService>;

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
      const statusHandler = jest.fn();
      const errorHandler = jest.fn();

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
