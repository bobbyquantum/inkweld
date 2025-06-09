import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ProjectAPIService,
  ProjectDto,
  ProjectElementDto,
} from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { DialogGatewayService } from './dialog-gateway.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { ProjectStateService } from './project-state.service';
import { RecentFilesService } from './recent-files.service';
import { SetupService } from './setup.service';
import { StorageService } from './storage.service';
import { UnifiedProjectService } from './unified-project.service';

// Mock state
let mockYArrayState: ProjectElementDto[] = [];
let mockArrayObservers: any[] = [];
function notifyObservers(event: any) {
  mockArrayObservers.forEach(callback => callback(event));
}
function createMockYArray() {
  return {
    toArray() {
      return [...mockYArrayState];
    },
    delete(start: number, length: number) {
      // Remove items from our simulated state.
      mockYArrayState.splice(start, length);
      // Notify observers once for this deletion.
      notifyObservers({ changes: { added: [], deleted: length } });
    },
    insert(index: number, elements: ProjectElementDto[]) {
      // Replace entire array with new elements
      mockYArrayState = elements;
      notifyObservers({
        changes: { added: elements, deleted: mockYArrayState.length },
      });
    },
    observe(callback: any) {
      mockArrayObservers.push(callback);
    },
    unobserve(callback: any) {
      mockArrayObservers = mockArrayObservers.filter(fn => fn !== callback);
    },
  };
}
// Mock Y.Doc and related classes
vi.mock('y-websocket');
vi.mock('y-indexeddb');
vi.mock('yjs', () => ({
  Doc: vi.fn(() => ({
    getMap: vi.fn(() => ({
      set: vi.fn(),
      get: vi.fn(),
      observe: vi.fn(),
    })),
    getArray: vi.fn(() => createMockYArray()),
    transact: vi.fn(fn => {
      console.log('executing transaction');
      fn();
    }),
    destroy: vi.fn(),
  })),
  Array: vi.fn(() => ({
    toArray: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    observe: vi.fn(),
  })),
  Map: vi.fn(),
}));

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockDialog: vi.Mocked<MatDialog>;
  let mockProjectAPI: vi.Mocked<ProjectAPIService>;
  let mockWebsocketProvider: vi.Mocked<WebsocketProvider>;
  let mockIndexeddbProvider: vi.Mocked<IndexeddbPersistence>;
  let mockYDoc: vi.Mocked<Y.Doc>;
  let mockUnifiedProjectService: vi.Mocked<UnifiedProjectService>;
  let mockSetupService: vi.Mocked<SetupService>;
  let mockOfflineElementsService: vi.Mocked<OfflineProjectElementsService>;
  let mockDialogGatewayService: vi.Mocked<DialogGatewayService>;
  let mockRecentFilesService: vi.Mocked<RecentFilesService>;
  let mockStorageService: vi.Mocked<StorageService>;

  const mockDate = new Date('2025-02-22T22:43:16.240Z');

  const mockProject: ProjectDto = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser', // Replace user with username property
    createdDate: mockDate.toISOString(),
    updatedDate: mockDate.toISOString(),
  };

  const mockElementDto: ProjectElementDto = {
    id: '1',
    name: 'Test Element',
    type: 'FOLDER',
    level: 0,
    position: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    // Reset mock elements
    mockYArrayState = [];
    mockArrayObservers = [];

    mockDialog = {
      open: vi.fn(),
    } as unknown as vi.Mocked<MatDialog>;

      mockProjectAPI = {
        projectControllerGetProjectByUsernameAndSlug: vi
          .fn()
          .mockReturnValue(of(mockProject)),
      } as unknown as vi.Mocked<ProjectAPIService>;

    mockUnifiedProjectService = {
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as vi.Mocked<UnifiedProjectService>;

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    } as unknown as vi.Mocked<SetupService>;

    mockOfflineElementsService = {
      loadElements: vi.fn(),
      elements: vi.fn().mockReturnValue([]),
    } as unknown as vi.Mocked<OfflineProjectElementsService>;

    mockDialogGatewayService = {
      openDialog: vi.fn(),
      openEditProjectDialog: vi.fn().mockResolvedValue(null),
      openNewElementDialog: vi.fn().mockResolvedValue(null),
    } as unknown as vi.Mocked<DialogGatewayService>;

    mockRecentFilesService = {
      addFile: vi.fn(),
      addRecentFile: vi.fn(),
      getRecentFilesForProject: vi.fn().mockReturnValue([]),
    } as unknown as vi.Mocked<RecentFilesService>;

    mockStorageService = {
      isAvailable: vi.fn().mockReturnValue(true),
      initializeDatabase: vi.fn().mockResolvedValue({} as IDBDatabase),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as vi.Mocked<StorageService>;

    mockWebsocketProvider = {
      on: vi.fn().mockImplementation(() => () => {}),
      connect: vi.fn(),
      disconnect: vi.fn(),
      destroy: vi.fn(),
    } as unknown as vi.Mocked<WebsocketProvider>;

    mockIndexeddbProvider = {
      whenSynced: Promise.resolve(),
    } as unknown as vi.Mocked<IndexeddbPersistence>;

    // Mock constructors
    (WebsocketProvider as vi.Mock).mockImplementation(
      () => mockWebsocketProvider
    );
    (IndexeddbPersistence as vi.Mock).mockImplementation(
      () => mockIndexeddbProvider
    );

    // Set up mock YDoc instance
    mockYDoc = new Y.Doc() as vi.Mocked<Y.Doc>;
    (Y.Doc as vi.Mock).mockImplementation(() => mockYDoc);
    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: ProjectAPIService, useValue: mockProjectAPI },
        { provide: UnifiedProjectService, useValue: mockUnifiedProjectService },
        { provide: SetupService, useValue: mockSetupService },
        {
          provide: OfflineProjectElementsService,
          useValue: mockOfflineElementsService,
        },
        { provide: DialogGatewayService, useValue: mockDialogGatewayService },
        { provide: RecentFilesService, useValue: mockRecentFilesService },
        { provide: StorageService, useValue: mockStorageService },
      ],
    });

    service = TestBed.inject(ProjectStateService);
    service.project.set(mockProject);

    // Initialize the Yjs document
    service['doc'] = mockYDoc;

    // Set up default WebSocket status handler
    mockWebsocketProvider.on.mockImplementation(
      (event: string, callback: any) => {
        if (event === 'status') {
          const mockEvent = {
            status: 'connected',
            valueOf: () => true,
          };
          callback(mockEvent);
        }
        return () => {};
      }
    );
  });

  describe('Project Loading', () => {
    it('should load project metadata and initialize Yjs document', async () => {
      await service.loadProject('testuser', 'test-project');

      expect(
        mockProjectAPI.projectControllerGetProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('testuser', 'test-project');
      expect(service.project()).toEqual(mockProject);
      expect(IndexeddbPersistence).toHaveBeenCalled();
      expect(WebsocketProvider).toHaveBeenCalled();
    });

    it('should handle errors during project loading', async () => {
      mockProjectAPI.projectControllerGetProjectByUsernameAndSlug.mockReturnValue(
        throwError(() => new Error('API Error'))
      );

      await service.loadProject('testuser', 'test-project').catch(() => {});

      expect(service.error()).toBe('Failed to load project');
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });
  });

  describe('Document Management', () => {
    it('should open a document in editor tabs', () => {
      service.openDocument(mockElementDto);
      expect(service.openDocuments()).toContain(mockElementDto);
      // Tab index is 1-based with 0 = home tab, 1 = first document tab
      expect(service.selectedTabIndex()).toBe(1);
    });

    it('should not duplicate already open documents', () => {
      service.openDocument(mockElementDto);
      service.openDocument(mockElementDto);
      expect(service.openDocuments()).toHaveLength(1);
    });

    it('should close a document and update selected tab', () => {
      service.openDocument(mockElementDto);
      service.selectedTabIndex.set(0);
      service.closeDocument(0);
      expect(service.openDocuments()).toHaveLength(0);
      expect(service.selectedTabIndex()).toBe(0);
    });
  });

  describe('Sync State Management', () => {
    it('should update sync state when WebSocket connects', async () => {
      // Mock WebSocket status handler
      mockWebsocketProvider.on.mockImplementation((event, callback) => {
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
          callback(mockEvent, mockWebsocketProvider);
        }
        return () => {};
      });

      await service.loadProject('testuser', 'test-project');
      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });

    it('should handle WebSocket connection errors', async () => {
      // Mock WebSocket error handler
      mockWebsocketProvider.on.mockImplementation((event, callback) => {
        if (event === 'status') {
          const mockEvent = new CloseEvent('close', {
            code: 1006,
            reason: 'Connection error',
            wasClean: false,
            bubbles: true,
            cancelable: true,
          }) as CloseEvent & { status: 'disconnected' } & boolean;
          mockEvent.status = 'disconnected';
          Object.assign(mockEvent, { valueOf: () => false });
          callback(mockEvent, mockWebsocketProvider);
        }
        return () => {};
      });

      await service.loadProject('testuser', 'test-project');
      expect(service.getSyncState()).toBe(DocumentSyncState.Offline);
    });

    it('should handle network restoration', async () => {
      await service.loadProject('testuser', 'test-project');
      // Simulate network restoration
      window.dispatchEvent(new Event('online'));
      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });
  });

  describe('Project Updates', () => {
    it('should update project metadata', () => {
      const updatedProject = {
        ...mockProject,
        title: 'Updated Title',
        description: 'Updated Description',
      };

      // Mock the dialog to return the updated project
      mockDialogGatewayService.openEditProjectDialog.mockResolvedValue(
        updatedProject
      );

      service.showEditProjectDialog();

      expect(
        mockDialogGatewayService.openEditProjectDialog
      ).toHaveBeenCalledWith(mockProject);
    });
  });

  describe('Element Management', () => {
    it('should add root level element', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'New Folder');
      const elements = service.elements();

      expect(elements).toHaveLength(1);
      expect(elements[0].name).toBe('New Folder');
      expect(elements[0].level).toBe(0);
      expect(elements[0].position).toBe(0);
    });

    it('should add child element and auto-expand parent', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Parent');
      const parent = service.elements()[0];

      service.addElement('ITEM', 'New Item', parent.id);

      const elements = service.elements();
      expect(elements).toHaveLength(2);
      expect(elements[0].name).toBe('Parent');
      expect(elements[1].name).toBe('New Item');
      expect(service.isExpanded(parent.id)).toBe(true);
    });

    it('should maintain correct positions when adding elements', async () => {
      await service.loadProject('testuser', 'test-project');

      service.addElement('FOLDER', 'Folder 1');
      const folder1 = service.elements()[0];
      service.addElement('FOLDER', 'Folder 2');
      service.addElement('ITEM', 'Item 1', folder1.id);

      const elements = service.elements();
      expect(elements).toHaveLength(3);
      // Verify we have the expected elements
      expect(elements.some(e => e.name === 'Folder 1' && e.level === 0)).toBe(
        true
      );
      expect(elements.some(e => e.name === 'Folder 2' && e.level === 0)).toBe(
        true
      );
      expect(elements.some(e => e.name === 'Item 1' && e.level === 1)).toBe(
        true
      );
      expect(elements.find(e => e.name === 'Item 1')?.level).toBe(1);
    });
  });

  describe('Tree Operations', () => {
    it('should move element and its subtree', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Root 1');
      const root1 = service.elements()[0];
      service.addElement('ITEM', 'Child 1', root1.id);
      service.addElement('FOLDER', 'Root 2');

      service.moveElement('root1', 2, 0);
      const movedElements = service.elements();
      expect(movedElements.map(e => e.name)).toEqual([
        'Root 2',
        'Root 1',
        'Child 1',
      ]);
    });

    it('should delete element and its subtree', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Root');
      const root = service.elements()[0];
      service.addElement('FOLDER', 'Child 1', root.id);
      const child1 = service.elements()[1];
      service.addElement('ITEM', 'Grandchild', child1.id);

      service.setExpanded(root.id, true);
      service.setExpanded(child1.id, true);

      service.deleteElement(child1.id);

      const remainingElements = service.elements();
      expect(remainingElements).toHaveLength(1);
      expect(remainingElements[0].name).toBe('Root');
      expect(service.isExpanded(child1.id)).toBe(false);
    });

    describe('Drop Validation', () => {
      it('should validate root level drops', () => {
        expect(service.isValidDrop(null, 0)).toBe(true);
        expect(service.isValidDrop(null, 1)).toBe(true);
        expect(service.isValidDrop(null, 2)).toBe(false);
      });

      it('should validate drops relative to folders', async () => {
        await service.loadProject('testuser', 'test-project');
        service.addElement('FOLDER', 'Parent');
        const folder = service.elements()[0];

        expect(service.isValidDrop(folder, folder.level)).toBe(true); // Same level
        expect(service.isValidDrop(folder, folder.level + 1)).toBe(true); // One level deeper
        expect(service.isValidDrop(folder, folder.level + 2)).toBe(false); // Too deep
      });

      it('should validate drops relative to items', async () => {
        await service.loadProject('testuser', 'test-project');
        service.addElement('ITEM', 'Item');
        const item = service.elements()[0];

        expect(service.isValidDrop(item, item.level)).toBe(true); // Same level
        expect(service.isValidDrop(item, item.level + 1)).toBe(false); // Can't nest under item
      });

      describe('getValidDropLevels', () => {
        it('should handle case with no nodes', () => {
          const result = service.getValidDropLevels(null, null);
          expect(result.levels).toEqual([0]);
          expect(result.defaultLevel).toBe(0);
        });

        it('should handle case with only nodeBelow', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('ITEM', 'Item');
          const nodeBelow = service.elements()[0];

          const result = service.getValidDropLevels(null, nodeBelow);
          expect(result.levels).toContain(nodeBelow.level);
          expect(result.defaultLevel).toBe(nodeBelow.level);
        });

        it('should handle case with only nodeAbove', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Folder');
          const folderAbove = service.elements()[0];

          const result = service.getValidDropLevels(folderAbove, null);
          // Should allow current level and child level for folders
          expect(result.levels).toContain(folderAbove.level);
          expect(result.levels).toContain(folderAbove.level + 1);
          expect(result.defaultLevel).toBe(Math.min(...result.levels));

          // Test with item above
          service.addElement('ITEM', 'Item');
          const itemAbove = service.elements()[1];

          const resultItem = service.getValidDropLevels(itemAbove, null);
          // Should only allow current level for items
          expect(resultItem.levels).toContain(itemAbove.level);
        });

        it('should handle nodeAbove with lower level than nodeBelow', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Parent');
          const folderAbove = service.elements()[0];

          service.addElement('ITEM', 'Child', folderAbove.id);
          const nodeBelow = service.elements()[1];

          const result = service.getValidDropLevels(folderAbove, nodeBelow);
          expect(result.levels).toContain(nodeBelow.level);
        });

        it('should handle nodeAbove with same level as nodeBelow', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Folder1');
          const folderAbove = service.elements()[0];

          service.addElement('FOLDER', 'Folder2');
          const nodeBelow = service.elements()[1];

          const result = service.getValidDropLevels(folderAbove, nodeBelow);
          // Should allow same level and child level for folders
          expect(result.levels).toContain(folderAbove.level);
          expect(result.levels).toContain(folderAbove.level + 1);
        });

        it('should handle nodeAbove with higher level than nodeBelow', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Root');
          const rootNode = service.elements()[0];

          service.addElement('ITEM', 'Child', rootNode.id);
          const nodeAbove = service.elements()[1];

          service.addElement('ITEM', 'Next Root');
          const nodeBelow = service.elements()[2];

          const result = service.getValidDropLevels(nodeAbove, nodeBelow);
          // Should allow levels between the two nodes
          expect(result.levels).toContain(nodeAbove.level);
          expect(result.levels).toContain(nodeBelow.level);
        });
      });

      describe('getDropInsertIndex', () => {
        it('should return 0 for drop at root level with no nodeAbove', () => {
          const index = service.getDropInsertIndex(null, 0);
          expect(index).toBe(0);
        });

        it('should insert after nodeAbove when dropping at a deeper level', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Folder');
          const folderNode = service.elements()[0];

          const index = service.getDropInsertIndex(
            folderNode,
            folderNode.level + 1
          );
          expect(index).toBe(1); // Insert right after the folder
        });

        it('should insert after the entire subtree when dropping at same level', async () => {
          await service.loadProject('testuser', 'test-project');
          service.addElement('FOLDER', 'Parent');
          const parentNode = service.elements()[0];

          service.addElement('ITEM', 'Child1', parentNode.id);
          service.addElement('ITEM', 'Child2', parentNode.id);

          const index = service.getDropInsertIndex(
            parentNode,
            parentNode.level
          );
          expect(index).toBe(3); // Insert after parent and its 2 children
        });
      });
    });
  });

  describe('Tree Node Expansion', () => {
    it('should toggle expanded state', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Folder');
      const folder = service.elements()[0];

      // Initial state should be collapsed
      expect(service.isExpanded(folder.id)).toBe(false);

      // Toggle to expanded
      service.toggleExpanded(folder.id);
      expect(service.isExpanded(folder.id)).toBe(true);

      // Toggle back to collapsed
      service.toggleExpanded(folder.id);
      expect(service.isExpanded(folder.id)).toBe(false);
    });

    it('should explicitly set expanded state', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Folder');
      const folder = service.elements()[0];

      service.setExpanded(folder.id, true);
      expect(service.isExpanded(folder.id)).toBe(true);

      service.setExpanded(folder.id, false);
      expect(service.isExpanded(folder.id)).toBe(false);
    });
  });

  describe('Dialog Operations', () => {
    it('should open new element dialog', () => {
      const mockDialogResult = {
        type: 'FOLDER',
        name: 'New Test Folder',
      };

      service['dialogGateway'] = {
        openNewElementDialog: vi.fn().mockResolvedValue(mockDialogResult),
      } as any;

      service.showNewElementDialog();

      expect(service['dialogGateway'].openNewElementDialog).toHaveBeenCalled();
    });

    it('should handle dialog cancellation', () => {
      const initialElements = service.elements();

      service['dialogGateway'] = {
        openNewElementDialog: vi.fn().mockResolvedValue(null),
      } as any;

      service.showNewElementDialog();

      // No new elements should be added
      expect(service.elements()).toEqual(initialElements);
    });
  });

  describe('Visible Elements', () => {
    it('should return empty array when no elements exist', async () => {
      await service.loadProject('testuser', 'test-project');
      // No elements added, should be empty by default
      expect(service.visibleElements()).toEqual([]);
    });

    it('should show root level elements', async () => {
      await service.loadProject('testuser', 'test-project');

      service.addElement('FOLDER', 'root');
      const visible = service.visibleElements();

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe('root');
      expect(visible[0].expanded).toBe(false);
    });

    it('should show children when parent is expanded', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Parent');
      const parent = service.elements()[0];
      service.addElement('ITEM', 'Child', parent.id);
      service.setExpanded(parent.id, true);
      const visible = service.visibleElements();

      expect(visible).toHaveLength(2);
      expect(visible[0].name).toBe('Parent');
      expect(visible[0].expanded).toBe(true);
      expect(visible[1].name).toBe('Child');
    });

    it('should hide children when parent is collapsed', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Parent');
      const parent = service.elements()[0];
      service.addElement('ITEM', 'Child', parent.id);
      service.setExpanded(parent.id, false); // Ensure parent is collapsed
      const visible = service.visibleElements(); // Parent should be collapsed by default

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe('Parent');
      expect(visible[0].expanded).toBe(false);
    });

    it('should handle multiple levels of nesting with mixed expanded states', async () => {
      await service.loadProject('testuser', 'test-project');
      service.addElement('FOLDER', 'Root');
      const root = service.elements()[0];
      service.addElement('FOLDER', 'Child 1', root.id);
      const child1 = service.elements()[1];
      service.addElement('ITEM', 'Grandchild 1', child1.id);
      service.addElement('FOLDER', 'Child 2', root.id);

      service.setExpanded(root.id, true);
      service.setExpanded(child1.id, true);
      const visible = service.visibleElements();

      expect(visible).toHaveLength(4);
      expect(visible[0].name).toBe('Root');
      expect(visible[0].expanded).toBe(true);

      // Verify all expected elements are present
      const names = visible.map(e => e.name);
      expect(names).toContain('Child 1');
      expect(names).toContain('Child 2');
      expect(names).toContain('Grandchild 1');
      // Verify Child 1 comes before its Grandchild
      expect(names.indexOf('Child 1')).toBeLessThan(
        names.indexOf('Grandchild 1')
      );
    });
  });
});
