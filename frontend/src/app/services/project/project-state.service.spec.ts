import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Element, ElementType, Project, ProjectsService } from '@inkweld/index';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishPlan } from '../../models/publish-plan';
import { DialogGatewayService } from '../core/dialog-gateway.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { StorageService } from '../offline/storage.service';
import { UnifiedProjectService } from '../offline/unified-project.service';
import {
  ElementSyncProviderFactory,
  IElementSyncProvider,
} from '../sync/index';
import { ProjectStateService } from './project-state.service';
import { RecentFilesService } from './recent-files.service';

/**
 * Creates a mock IElementSyncProvider for testing.
 */
function createMockSyncProvider(): MockedObject<IElementSyncProvider> & {
  _elementsSubject: BehaviorSubject<Element[]>;
  _publishPlansSubject: BehaviorSubject<PublishPlan[]>;
  _syncStateSubject: BehaviorSubject<DocumentSyncState>;
  _errorsSubject: Subject<string>;
} {
  const elementsSubject = new BehaviorSubject<Element[]>([]);
  const publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
  const syncStateSubject = new BehaviorSubject<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );
  const errorsSubject = new Subject<string>();

  return {
    _elementsSubject: elementsSubject,
    _publishPlansSubject: publishPlansSubject,
    _syncStateSubject: syncStateSubject,
    _errorsSubject: errorsSubject,

    connect: vi.fn().mockResolvedValue({ success: true }),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getSyncState: vi.fn(() => syncStateSubject.getValue()),
    getElements: vi.fn(() => elementsSubject.getValue()),
    getPublishPlans: vi.fn(() => publishPlansSubject.getValue()),
    updateElements: vi.fn((elements: Element[]) => {
      elementsSubject.next(elements);
    }),
    updatePublishPlans: vi.fn((plans: PublishPlan[]) => {
      publishPlansSubject.next(plans);
    }),

    syncState$: syncStateSubject.asObservable(),
    elements$: elementsSubject.asObservable(),
    publishPlans$: publishPlansSubject.asObservable(),
    errors$: errorsSubject.asObservable(),
  } as MockedObject<IElementSyncProvider> & {
    _elementsSubject: BehaviorSubject<Element[]>;
    _publishPlansSubject: BehaviorSubject<PublishPlan[]>;
    _syncStateSubject: BehaviorSubject<DocumentSyncState>;
    _errorsSubject: Subject<string>;
  };
}

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockSyncProvider: ReturnType<typeof createMockSyncProvider>;
  let mockSyncProviderFactory: MockedObject<ElementSyncProviderFactory>;
  let mockDialog: MockedObject<MatDialog>;
  let mockProjectAPI: MockedObject<ProjectsService>;
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
    username: 'testuser',
    createdDate: mockDate.toISOString(),
    updatedDate: mockDate.toISOString(),
  };

  const mockElementDto: Element = {
    id: 'element-1',
    name: 'Test Element',
    type: ElementType.Folder,
    parentId: null,
    level: 0,
    order: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };

  beforeAll(() => {
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    if (service) {
      service.ngOnDestroy();
    }
  });

  beforeEach(() => {
    TestBed.resetTestingModule();

    // Create mock sync provider
    mockSyncProvider = createMockSyncProvider();

    mockSyncProviderFactory = {
      getProvider: vi.fn().mockReturnValue(mockSyncProvider),
      getCurrentMode: vi.fn().mockReturnValue('server'),
      isOfflineMode: vi.fn().mockReturnValue(false),
    } as unknown as MockedObject<ElementSyncProviderFactory>;

    mockDialog = {
      open: vi.fn(),
    } as unknown as MockedObject<MatDialog>;

    mockProjectAPI = {
      getProject: vi.fn().mockReturnValue(of(mockProject)),
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

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
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
        {
          provide: ElementSyncProviderFactory,
          useValue: mockSyncProviderFactory,
        },
      ],
    });

    service = TestBed.inject(ProjectStateService);
    service.project.set(mockProject);
  });

  describe('Project Loading', () => {
    it('should load project metadata and connect sync provider', async () => {
      await service.loadProject('testuser', 'test-project');

      expect(mockProjectAPI.getProject).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(service.project()).toEqual(mockProject);
      expect(mockSyncProviderFactory.getProvider).toHaveBeenCalled();
      expect(mockSyncProvider.connect).toHaveBeenCalledWith({
        username: 'testuser',
        slug: 'test-project',
        webSocketUrl: 'ws://localhost:8333',
      });
      expect(service.error()).toBeFalsy();
    });

    it('should handle errors during project loading', async () => {
      mockProjectAPI.getProject.mockImplementation(() => {
        throw new Error('API Error');
      });

      await service.loadProject('testuser', 'test-project').catch(() => {});

      expect(service.error()).toBe('Failed to load project: API Error');
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should handle sync provider connection failure', async () => {
      mockSyncProvider.connect.mockResolvedValue({
        success: false,
        error: 'WebSocket connection failed',
      });

      await service.loadProject('testuser', 'test-project').catch(() => {});

      expect(service.error()).toBe(
        'Failed to load project: WebSocket connection failed'
      );
    });
  });

  describe('Sync Provider Integration', () => {
    it('should subscribe to elements changes from provider', async () => {
      await service.loadProject('testuser', 'test-project');

      const testElements: Element[] = [
        {
          id: 'elem-1',
          name: 'Test',
          type: ElementType.Folder,
          parentId: null,
          level: 0,
          order: 0,
          expandable: true,
          version: 0,
          metadata: {},
        },
      ];

      // Simulate provider emitting elements
      mockSyncProvider._elementsSubject.next(testElements);

      expect(service.elements()).toEqual(testElements);
    });

    it('should subscribe to sync state changes from provider', async () => {
      await service.loadProject('testuser', 'test-project');

      // Simulate provider changing sync state
      mockSyncProvider._syncStateSubject.next(DocumentSyncState.Synced);

      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });

    it('should subscribe to errors from provider', async () => {
      await service.loadProject('testuser', 'test-project');

      // Simulate provider emitting error
      mockSyncProvider._errorsSubject.next('Connection lost');

      expect(service.error()).toBe('Connection lost');
    });

    it('should disconnect provider when loading new project', async () => {
      await service.loadProject('testuser', 'test-project');

      // Load a different project
      await service.loadProject('testuser', 'other-project');

      expect(mockSyncProvider.disconnect).toHaveBeenCalled();
    });
  });

  describe('Document Management', () => {
    it('should open a document in editor tabs', () => {
      service.openDocument(mockElementDto);
      expect(service.openDocuments()).toContain(mockElementDto);
      expect(service.selectedTabIndex()).toBe(1);
    });

    it('should not duplicate already open documents', () => {
      service.openDocument(mockElementDto);
      service.openDocument(mockElementDto);
      expect(service.openDocuments()).toHaveLength(1);
    });

    it('should close a document and update selected tab', () => {
      service.openDocument(mockElementDto);
      service.selectTab(0);
      service.closeDocument(0);
      expect(service.openDocuments()).toHaveLength(0);
      expect(service.selectedTabIndex()).toBe(0);
    });
  });

  describe('Sync State Management', () => {
    it('should initialize with unavailable sync state', () => {
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should update sync state after loading project', async () => {
      mockSyncProvider._syncStateSubject.next(DocumentSyncState.Synced);
      await service.loadProject('testuser', 'test-project');

      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
    });
  });

  describe('Element Management', () => {
    beforeEach(async () => {
      await service.loadProject('testuser', 'test-project');
    });

    it('should add root level element via sync provider', async () => {
      await service.addElement(ElementType.Folder, 'New Folder');

      expect(mockSyncProvider.updateElements).toHaveBeenCalled();
      const calledElements = mockSyncProvider.updateElements.mock.calls[0][0];
      expect(calledElements).toHaveLength(1);
      expect(calledElements[0].name).toBe('New Folder');
      expect(calledElements[0].level).toBe(0);
    });

    it('should add child element and auto-expand parent', async () => {
      // Add parent first
      await service.addElement(ElementType.Folder, 'Parent');
      const parentId = mockSyncProvider.updateElements.mock.calls[0][0][0].id;

      // Simulate provider returning the parent
      mockSyncProvider._elementsSubject.next([
        {
          id: parentId,
          name: 'Parent',
          type: ElementType.Folder,
          parentId: null,
          level: 0,
          order: 0,
          expandable: true,
          version: 0,
          metadata: {},
        },
      ]);

      // Add child
      await service.addElement(ElementType.Item, 'Child', parentId);

      expect(service.isExpanded(parentId)).toBe(true);
    });

    it('should delete element via sync provider', () => {
      const testElement: Element = {
        id: 'test-elem',
        name: 'Test',
        type: ElementType.Folder,
        parentId: null,
        level: 0,
        order: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };
      mockSyncProvider._elementsSubject.next([testElement]);

      service.deleteElement('test-elem');

      expect(mockSyncProvider.updateElements).toHaveBeenCalled();
      const calledElements = mockSyncProvider.updateElements.mock.calls[0][0];
      expect(calledElements).toHaveLength(0);
    });

    it('should rename element via sync provider', () => {
      const testElement: Element = {
        id: 'test-elem',
        name: 'Old Name',
        type: ElementType.Folder,
        parentId: null,
        level: 0,
        order: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };
      mockSyncProvider._elementsSubject.next([testElement]);

      service.renameNode(testElement, 'New Name');

      expect(mockSyncProvider.updateElements).toHaveBeenCalled();
      const calledElements = mockSyncProvider.updateElements.mock.calls[0][0];
      expect(calledElements[0].name).toBe('New Name');
    });
  });

  describe('Tree Operations', () => {
    beforeEach(async () => {
      await service.loadProject('testuser', 'test-project');
    });

    describe('Drop Validation', () => {
      it('should validate root level drops', () => {
        expect(service.isValidDrop(null, 0)).toBe(true);
        expect(service.isValidDrop(null, 1)).toBe(true);
        expect(service.isValidDrop(null, 2)).toBe(false);
      });

      it('should validate drops relative to folders', () => {
        const folder: Element = {
          id: 'folder-1',
          name: 'Folder',
          type: ElementType.Folder,
          parentId: null,
          level: 0,
          order: 0,
          expandable: true,
          version: 0,
          metadata: {},
        };

        expect(service.isValidDrop(folder, folder.level)).toBe(true);
        expect(service.isValidDrop(folder, folder.level + 1)).toBe(true);
        expect(service.isValidDrop(folder, folder.level + 2)).toBe(false);
      });

      it('should validate drops relative to items', () => {
        const item: Element = {
          id: 'item-1',
          name: 'Item',
          type: ElementType.Item,
          parentId: null,
          level: 0,
          order: 0,
          expandable: false,
          version: 0,
          metadata: {},
        };

        expect(service.isValidDrop(item, item.level)).toBe(true);
        expect(service.isValidDrop(item, item.level + 1)).toBe(false);
      });
    });

    describe('getValidDropLevels', () => {
      it('should handle case with no nodes', () => {
        const result = service.getValidDropLevels(null, null);
        expect(result.levels).toEqual([0]);
        expect(result.defaultLevel).toBe(0);
      });

      it('should handle case with only nodeBelow', () => {
        const nodeBelow: Element = {
          id: 'item-1',
          name: 'Item',
          type: ElementType.Item,
          parentId: null,
          level: 0,
          order: 0,
          expandable: false,
          version: 0,
          metadata: {},
        };

        const result = service.getValidDropLevels(null, nodeBelow);
        expect(result.levels).toContain(nodeBelow.level);
        expect(result.defaultLevel).toBe(nodeBelow.level);
      });

      it('should handle case with only nodeAbove', () => {
        const folderAbove: Element = {
          id: 'folder-1',
          name: 'Folder',
          type: ElementType.Folder,
          parentId: null,
          level: 0,
          order: 0,
          expandable: true,
          version: 0,
          metadata: {},
        };

        const result = service.getValidDropLevels(folderAbove, null);
        expect(result.levels).toContain(folderAbove.level);
        expect(result.levels).toContain(folderAbove.level + 1);
        expect(result.defaultLevel).toBe(Math.min(...result.levels));
      });
    });
  });

  describe('Tree Node Expansion', () => {
    it('should toggle expanded state', () => {
      const folderId = 'test-folder';

      expect(service.isExpanded(folderId)).toBe(false);

      service.toggleExpanded(folderId);
      expect(service.isExpanded(folderId)).toBe(true);

      service.toggleExpanded(folderId);
      expect(service.isExpanded(folderId)).toBe(false);
    });

    it('should explicitly set expanded state', () => {
      const folderId = 'test-folder';

      service.setExpanded(folderId, true);
      expect(service.isExpanded(folderId)).toBe(true);

      service.setExpanded(folderId, false);
      expect(service.isExpanded(folderId)).toBe(false);
    });
  });

  describe('Visible Elements', () => {
    beforeEach(async () => {
      await service.loadProject('testuser', 'test-project');
    });

    it('should return empty array when no elements exist', () => {
      mockSyncProvider._elementsSubject.next([]);
      expect(service.visibleElements()).toEqual([]);
    });

    it('should show root level elements', () => {
      const rootElement: Element = {
        id: 'root-1',
        name: 'Root',
        type: ElementType.Folder,
        parentId: null,
        level: 0,
        order: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };
      mockSyncProvider._elementsSubject.next([rootElement]);

      const visible = service.visibleElements();
      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe('Root');
      expect(visible[0].expanded).toBe(false);
    });

    it('should show children when parent is expanded', () => {
      const parent: Element = {
        id: 'parent-1',
        name: 'Parent',
        type: ElementType.Folder,
        parentId: null,
        level: 0,
        order: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };
      const child: Element = {
        id: 'child-1',
        name: 'Child',
        type: ElementType.Item,
        parentId: 'parent-1',
        level: 1,
        order: 1,
        expandable: false,
        version: 0,
        metadata: {},
      };
      mockSyncProvider._elementsSubject.next([parent, child]);
      service.setExpanded('parent-1', true);

      const visible = service.visibleElements();
      expect(visible).toHaveLength(2);
      expect(visible[0].name).toBe('Parent');
      expect(visible[0].expanded).toBe(true);
      expect(visible[1].name).toBe('Child');
    });

    it('should hide children when parent is collapsed', () => {
      const parent: Element = {
        id: 'parent-1',
        name: 'Parent',
        type: ElementType.Folder,
        parentId: null,
        level: 0,
        order: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };
      const child: Element = {
        id: 'child-1',
        name: 'Child',
        type: ElementType.Item,
        parentId: 'parent-1',
        level: 1,
        order: 1,
        expandable: false,
        version: 0,
        metadata: {},
      };
      mockSyncProvider._elementsSubject.next([parent, child]);
      service.setExpanded('parent-1', false);

      const visible = service.visibleElements();
      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe('Parent');
      expect(visible[0].expanded).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should disconnect provider on destroy', async () => {
      await service.loadProject('testuser', 'test-project');

      service.ngOnDestroy();

      expect(mockSyncProvider.disconnect).toHaveBeenCalled();
    });
  });
});
