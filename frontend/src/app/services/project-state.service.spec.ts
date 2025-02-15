import { TestBed } from '@angular/core/testing';
import { ProjectAPIService, ProjectElementDto } from '@worm/index';
import { of } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { projectServiceMock } from '../../testing/project-api.mock';
import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectStateService } from './project-state.service';

// Mock dependencies
jest.mock('yjs', () => ({
  Doc: jest.fn(() => ({
    getMap: jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      has: jest.fn(),
      observe: jest.fn(),
      toJSON: jest.fn(),
    })),
    transact: jest.fn((fn: () => void) => fn()),
  })),
  Array: jest.fn(() => ({
    push: jest.fn(),
    delete: jest.fn(),
    toArray: jest.fn(() => []),
    observeDeep: jest.fn(),
  })),
  Map: jest.fn(),
}));
jest.mock('y-indexeddb');
jest.mock('y-websocket');
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockDoc: jest.Mocked<Y.Doc>;
  let mockWebSocketProvider: jest.Mocked<WebsocketProvider>;
  let mockIndexedDbProvider: jest.Mocked<IndexeddbPersistence>;

  const mockProjectElement: ProjectElementDto = {
    id: '1',
    type: ProjectElementDto.TypeEnum.Folder,
    position: 0,
    level: 0,
    name: 'Test Folder',
  };

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Set up mock instances
    mockDoc = new Y.Doc() as jest.Mocked<Y.Doc>;
    (Y.Doc as jest.Mock).mockImplementation(() => mockDoc);
    mockWebSocketProvider = {
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<WebsocketProvider>;
    mockIndexedDbProvider = {
      whenSynced: Promise.resolve(),
      destroy: jest.fn(),
    } as unknown as jest.Mocked<IndexeddbPersistence>;

    // Mock constructors
    (WebsocketProvider as jest.Mock).mockImplementation(() => {
      return mockWebSocketProvider;
    });
    (IndexeddbPersistence as jest.Mock).mockImplementation(() => {
      return mockIndexedDbProvider;
    });

    // Configure TestBed
    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: ProjectAPIService, useValue: projectServiceMock },
      ],
    });

    // Inject service
    service = TestBed.inject(ProjectStateService);

    // Mock global window object for WebSocket URL
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        host: 'localhost:4200',
      },
      writable: true,
    });
  });

  describe('Project Loading', () => {
    it('should load project successfully', async () => {
      // Mock WebSocket provider to emit connected status
      mockWebSocketProvider.on.mockImplementation((name, callback) => {
        if (name === 'status') {
          const mockStatusEvent = {
            status: 'connected',
          };
          callback(
            mockStatusEvent as unknown as CloseEvent & {
              status: 'connected' | 'disconnected' | 'connecting';
            } & Event &
              boolean,
            mockWebSocketProvider
          );
        }
        return () => {};
      });

      projectServiceMock.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        of({
          id: '1',
          slug: 'test-project',
          title: 'Test Project',
          description: 'Test Description',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
          user: {
            username: 'testuser',
            name: 'Test User',
            avatarImageUrl: 'https://example.com/avatar.jpg',
          },
        })
      );
      await service.loadProject('testuser', 'test-project');

      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });

    it('should handle project loading errors', async () => {
      // Simulate IndexedDB sync failure
      mockIndexedDbProvider.whenSynced = Promise.reject(
        new Error('Sync failed')
      );

      await service.loadProject('testuser', 'test-project');

      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBe('Failed to load project');
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });
  });

  describe('Project Elements Management', () => {
    beforeEach(async () => {
      // Prepare a mock doc with elements
      await service.loadProject('testuser', 'test-project');
    });

    it('should update elements', () => {
      const elements: ProjectElementDto[] = [mockProjectElement];

      service.updateElements(elements);

      expect(service.elements()).toEqual(elements);
    });

    it('should save project elements', async () => {
      const elements: ProjectElementDto[] = [mockProjectElement];

      await service.saveProjectElements('testuser', 'test-project', elements);

      expect(service.elements()).toEqual(elements);
      expect(service.isSaving()).toBe(false);
      expect(service.error()).toBeUndefined();
    });
  });

  describe('File Management', () => {
    const mockFile: ProjectElementDto = {
      ...mockProjectElement,
      type: ProjectElementDto.TypeEnum.Item,
      name: 'test-file.txt',
    };

    it('should open a file', () => {
      service.openFile(mockFile);

      expect(service.openFiles()).toContain(mockFile);
      expect(service.selectedTabIndex()).toBe(1);
    });

    it('should close a file', () => {
      // Open multiple files first
      service.openFile(mockFile);
      service.openFile({ ...mockFile, id: '2', name: 'another-file.txt' });

      service.closeFile(0);

      expect(service.openFiles().length).toBe(1);
      expect(service.selectedTabIndex()).toBe(0);
    });
  });

  describe('Sync State Management', () => {
    it('should update sync state', () => {
      service.updateSyncState('test-doc', DocumentSyncState.Synced);

      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });
  });
});
