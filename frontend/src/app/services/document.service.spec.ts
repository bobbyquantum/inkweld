import { TestBed } from '@angular/core/testing';
import { Editor } from 'ngx-editor';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { DocumentService } from './document.service';
import { ProjectStateService } from './project-state.service';

// Mock dependencies
jest.mock('yjs', () => ({
  Doc: jest.fn(() => ({
    getXmlFragment: jest.fn(() => ({
      toJSON: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
    })),
    destroy: jest.fn(),
  })),
  XmlFragment: jest.fn(),
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
  let service: DocumentService;
  let mockProjectStateService: jest.Mocked<ProjectStateService>;
  let mockYDoc: jest.Mocked<Y.Doc>;
  let mockWebSocketProvider: jest.Mocked<WebsocketProvider>;
  let mockIndexedDbProvider: jest.Mocked<IndexeddbPersistence>;
  let mockEditor: jest.Mocked<Editor>;

  const testDocumentId = 'test-doc';

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

    // Configure TestBed
    TestBed.configureTestingModule({
      providers: [
        DocumentService,
        { provide: ProjectStateService, useValue: mockProjectStateService },
      ],
    });

    // Inject service
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

  describe('Document Connection Management', () => {
    it('should create new document connection', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);

      expect(service.isConnected(testDocumentId)).toBe(true);
      expect(mockYDoc.getXmlFragment).toHaveBeenCalledWith('prosemirror');
      expect(mockIndexedDbProvider.whenSynced).toBeTruthy();
      expect(mockWebSocketProvider.on).toHaveBeenCalledWith(
        'status',
        expect.any(Function)
      );
    });

    it('should reuse existing document connection', async () => {
      // First connection
      await service.setupCollaboration(mockEditor, testDocumentId);
      // Second connection attempt
      await service.setupCollaboration(mockEditor, testDocumentId);

      expect(mockYDoc.getXmlFragment).toHaveBeenCalledTimes(1);
      expect(mockIndexedDbProvider.whenSynced).toBeTruthy();
    });

    it('should disconnect specific document', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);
      service.disconnect(testDocumentId);

      expect(service.isConnected(testDocumentId)).toBe(false);
      expect(mockWebSocketProvider.destroy).toHaveBeenCalled();
      expect(mockIndexedDbProvider.destroy).toHaveBeenCalled();
      expect(mockYDoc.destroy).toHaveBeenCalled();
    });

    it('should disconnect all documents', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);
      service.disconnect();

      expect(service.isConnected(testDocumentId)).toBe(false);
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

      await service.setupCollaboration(mockEditor, testDocumentId);

      const syncStatus$ = service.getSyncStatus(testDocumentId);
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

      await service.setupCollaboration(mockEditor, testDocumentId);

      const syncStatus$ = service.getSyncStatus(testDocumentId);
      let currentStatus: DocumentSyncState | undefined;
      syncStatus$.subscribe(status => (currentStatus = status));

      expect(currentStatus).toBe(DocumentSyncState.Offline);
      expect(mockProjectStateService.updateSyncState).toHaveBeenCalledWith(
        testDocumentId,
        DocumentSyncState.Offline
      );
    });
  });

  describe('Collaboration Setup', () => {
    it('should add ProseMirror plugins', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);

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
        service.setupCollaboration(mockEditor, testDocumentId)
      ).rejects.toThrow('Editor Yjs not properly initialized');
    });
  });

  describe('Network Handling', () => {
    it('should attempt reconnection when online', async () => {
      await service.setupCollaboration(mockEditor, testDocumentId);

      // Simulate network restoration
      window.dispatchEvent(
        new Event('online', { bubbles: true, cancelable: true })
      );

      expect(mockWebSocketProvider.connect).toHaveBeenCalled();
    });
  });
});
