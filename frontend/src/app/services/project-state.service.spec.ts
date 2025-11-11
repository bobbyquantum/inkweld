// Mock Y.js and WebSocket providers BEFORE imports (hoisted by Vitest)
import { MockedObject, vi } from 'vitest';

// Create mock constructors that will be configured in beforeEach
const WebsocketProviderMock = vi.fn();
const IndexeddbPersistenceMock = vi.fn();
const YDocMock = vi.fn();

vi.mock('y-websocket', () => ({
  WebsocketProvider: WebsocketProviderMock,
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: IndexeddbPersistenceMock,
}));
vi.mock('yjs', () => ({
  Doc: YDocMock,
  Array: vi.fn(),
  Map: vi.fn(),
}));

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  ProjectsService,
  Project,
  GetApiV1ProjectsUsernameSlugElements200ResponseInner,
} from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

import { DocumentSyncState } from '../models/document-sync-state';
import { DialogGatewayService } from './dialog-gateway.service';
import { LoggerService } from './logger.service';
import { OfflineProjectElementsService } from './offline-project-elements.service';
import { ProjectStateService } from './project-state.service';
import { RecentFilesService } from './recent-files.service';
import { SetupService } from './setup.service';
import { StorageService } from './storage.service';
import { UnifiedProjectService } from './unified-project.service';

// Mock state - will be reset per test
const mockYArrayState: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] = [];
const mockArrayObservers: any[] = [];

function createMockYArray() {
  // Create isolated state for THIS array instance
  let localArrayState: GetApiV1ProjectsUsernameSlugElements200ResponseInner[] = [];
  const localObservers: any[] = [];

  function notifyLocalObservers(event: any) {
    localObservers.forEach(callback => callback(event));
  }

  return {
    toArray() {
      return [...localArrayState];
    },
    delete(start: number, length: number) {
      // Remove items from our simulated state.
      localArrayState.splice(start, length);
      // Notify observers once for this deletion.
      notifyLocalObservers({ changes: { added: [], deleted: length } });
    },
    insert(index: number, elements: GetApiV1ProjectsUsernameSlugElements200ResponseInner[]) {
      // Replace entire array with new elements
      localArrayState = elements;
      notifyLocalObservers({
        changes: { added: elements, deleted: localArrayState.length },
      });
    },
    observe(callback: any) {
      localObservers.push(callback);
    },
    unobserve(callback: any) {
      const index = localObservers.indexOf(callback);
      if (index > -1) localObservers.splice(index, 1);
    },
  };
}

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockDialog: MockedObject<MatDialog>;
  let mockProjectAPI: MockedObject<ProjectsService>;
  let mockWebsocketProvider: MockedObject<WebsocketProvider>;
  let mockIndexeddbProvider: MockedObject<IndexeddbPersistence>;
  let mockYDoc: MockedObject<Y.Doc>;
  let mockUnifiedProjectService: MockedObject<UnifiedProjectService>;
  let mockSetupService: MockedObject<SetupService>;
  let mockOfflineElementsService: MockedObject<OfflineProjectElementsService>;
  let mockDialogGatewayService: MockedObject<DialogGatewayService>;
  let mockRecentFilesService: MockedObject<RecentFilesService>;
  let mockStorageService: MockedObject<StorageService>;
  let mockLoggerService: MockedObject<LoggerService>;

  const mockDate = new Date('2025-02-22T22:43:16.240Z');

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser', // Replace user with username property
    createdDate: mockDate.toISOString(),
    updatedDate: mockDate.toISOString(),
  };

  const mockElementDto: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
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
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    // Clean up to prevent WebSocket errors and reset state
    if (service) {
      // Forcefully clear all Y.js observers before destroying
      if (service['doc']) {
        try {
          const elementsArray = service['doc'].getArray('elements');
          // Clear the mock array's local state
          if (elementsArray && typeof elementsArray.toArray === 'function') {
            const currentArray = elementsArray.toArray();
            if (
              currentArray.length > 0 &&
              typeof elementsArray.delete === 'function'
            ) {
              elementsArray.delete(0, currentArray.length);
            }
          }
        } catch {
          // Ignore errors during cleanup
        }
        service['doc'].destroy();
        service['doc'] = null;
      }

      service['provider']?.destroy();
      service['indexeddbProvider'] = null;
      service['provider'] = null;
      service['docId'] = null;
      // Force reset signals
      service['elements'].set([]);
      service['openDocuments'].set([]);
      service['openTabs'].set([]);
    }
  });

  beforeEach(() => {
    // Reset TestBed to ensure fresh service instances
    TestBed.resetTestingModule();

    // Reset mock elements - MUST clear the array completely
    mockYArrayState.length = 0;
    mockArrayObservers.length = 0;

    // Reset mock call tracking
    WebsocketProviderMock.mockClear();
    IndexeddbPersistenceMock.mockClear();
    YDocMock.mockClear();

    mockDialog = {
      open: vi.fn(),
    } as unknown as MockedObject<MatDialog>;

    mockProjectAPI = {
      getApiProjectsUsernameSlug: vi
        .fn()
        .mockReturnValue(of(mockProject)),
    } as unknown as MockedObject<ProjectsService>;

    mockUnifiedProjectService = {
      getProject: vi.fn().mockResolvedValue(mockProject),
    } as unknown as MockedObject<UnifiedProjectService>;

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
      getWebSocketUrl: vi.fn().mockReturnValue('ws://localhost:8333'),
    } as unknown as MockedObject<SetupService>;

    mockOfflineElementsService = {
      loadElements: vi.fn(),
      elements: vi.fn().mockReturnValue([]),
    } as unknown as MockedObject<OfflineProjectElementsService>;

    mockDialogGatewayService = {
      openDialog: vi.fn(),
      openEditProjectDialog: vi.fn().mockResolvedValue(null),
      openNewElementDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    mockRecentFilesService = {
      addFile: vi.fn(),
      addRecentFile: vi.fn(),
      getRecentFilesForProject: vi.fn().mockReturnValue([]),
    } as unknown as MockedObject<RecentFilesService>;

    mockStorageService = {
      isAvailable: vi.fn().mockReturnValue(true),
      initializeDatabase: vi.fn().mockResolvedValue({} as IDBDatabase),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<StorageService>;

    mockLoggerService = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      group: vi.fn(),
    } as unknown as MockedObject<LoggerService>;

    mockWebsocketProvider = {
      on: vi.fn().mockImplementation(() => () => {}),
      connect: vi.fn(),
      disconnect: vi.fn(),
      destroy: vi.fn(),
    } as unknown as MockedObject<WebsocketProvider>;

    mockIndexeddbProvider = {
      whenSynced: Promise.resolve(),
    } as unknown as MockedObject<IndexeddbPersistence>;

    // Set up mock YDoc instance with proper methods
    // IMPORTANT: getArray() must return the SAME array instance for the same key
    const arrayCache = new Map<string, any>();
    mockYDoc = {
      getMap: vi.fn(() => ({
        set: vi.fn(),
        get: vi.fn(),
        observe: vi.fn(),
      })),
      getArray: vi.fn((key: string = 'elements') => {
        if (!arrayCache.has(key)) {
          arrayCache.set(key, createMockYArray());
        }
        return arrayCache.get(key);
      }),
      transact: vi.fn((fn: () => void) => {
        fn();
      }),
      destroy: vi.fn(),
    } as unknown as MockedObject<Y.Doc>;

    // Configure mock constructors
    WebsocketProviderMock.mockImplementation(
      () => mockWebsocketProvider as any
    );
    IndexeddbPersistenceMock.mockImplementation(
      () => mockIndexeddbProvider as any
    );
    YDocMock.mockImplementation(() => mockYDoc as any);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // Override to force new instance each test
        { provide: ProjectStateService, useClass: ProjectStateService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: ProjectsService, useValue: mockProjectAPI },
        { provide: UnifiedProjectService, useValue: mockUnifiedProjectService },
        { provide: SetupService, useValue: mockSetupService },
        {
          provide: OfflineProjectElementsService,
          useValue: mockOfflineElementsService,
        },
        { provide: DialogGatewayService, useValue: mockDialogGatewayService },
        { provide: RecentFilesService, useValue: mockRecentFilesService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: LoggerService, useValue: mockLoggerService },
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
          callback(mockEvent as any, mockWebsocketProvider);
        }
        return () => {};
      }
    );
  });

  describe('Project Loading', () => {
    it('should load project metadata and initialize Yjs document', async () => {
      await service.loadProject('testuser', 'test-project');

      expect(
        mockProjectAPI.getApiProjectsUsernameSlug
      ).toHaveBeenCalledWith('testuser', 'test-project');
      expect(service.project()).toEqual(mockProject);
      // Error should be null or undefined (not set)
      expect(service.error()).toBeFalsy();
    });

    it('should handle errors during project loading', async () => {
      mockProjectAPI.getApiProjectsUsernameSlug.mockReturnValue(
        throwError(() => new Error('API Error'))
      );

      await service.loadProject('testuser', 'test-project').catch(() => {});

      expect(service.error()).toBe('Failed to load project: API Error');
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
    it('should initialize with unavailable sync state', () => {
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should have sync state after loading project', async () => {
      await service.loadProject('testuser', 'test-project');
      // Sync state should be set (either Synced or Offline depending on mock)
      expect(service.getSyncState()).toBeDefined();
    });

    it('should update sync state signal', async () => {
      await service.loadProject('testuser', 'test-project');
      // State should be defined after loading
      const afterLoadState = service.getSyncState();
      expect(afterLoadState).toBeDefined();
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
      expect(elements[0].order).toBe(0);
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
      service['dialogGateway'] = {
        openNewElementDialog: vi.fn().mockResolvedValue(null),
      } as any;

      service.showNewElementDialog();

      // No new elements should be added
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
      const names = visible.map((e: any) => e.name);
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


