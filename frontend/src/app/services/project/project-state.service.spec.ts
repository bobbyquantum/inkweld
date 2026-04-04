import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  type Element,
  ElementType,
  type Project,
  ProjectsService,
} from '@inkweld/index';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import {
  type ElementRelationship,
  type RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  type ElementTag,
  type TagDefinition,
} from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
import { PublishFormat, type PublishPlan } from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { DialogGatewayService } from '../core/dialog-gateway.service';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { BackgroundSyncService } from '../local/background-sync.service';
import { LocalProjectElementsService } from '../local/local-project-elements.service';
import { ProjectSyncService } from '../local/project-sync.service';
import { StorageService } from '../local/storage.service';
import { UnifiedProjectService } from '../local/unified-project.service';
import {
  ElementSyncProviderFactory,
  type IElementSyncProvider,
  type ProjectMeta,
} from '../sync/index';
import { ProjectStateService } from './project-state.service';
import { RecentFilesService } from './recent-files.service';
import { type AppTab, TabManagerService } from './tab-manager.service';

/**
 * Creates a mock IElementSyncProvider for testing.
 */
function createMockSyncProvider(): MockedObject<IElementSyncProvider> & {
  _elementsSubject: BehaviorSubject<Element[]>;
  _publishPlansSubject: BehaviorSubject<PublishPlan[]>;
  _relationshipsSubject: BehaviorSubject<ElementRelationship[]>;
  _customTypesSubject: BehaviorSubject<RelationshipTypeDefinition[]>;
  _schemasSubject: BehaviorSubject<ElementTypeSchema[]>;
  _elementTagsSubject: BehaviorSubject<ElementTag[]>;
  _customTagsSubject: BehaviorSubject<TagDefinition[]>;
  _projectMetaSubject: BehaviorSubject<ProjectMeta | undefined>;
  _syncStateSubject: BehaviorSubject<DocumentSyncState>;
  _errorsSubject: Subject<string>;
  _lastConnectionErrorSubject: BehaviorSubject<string | null>;
} {
  const elementsSubject = new BehaviorSubject<Element[]>([]);
  const publishPlansSubject = new BehaviorSubject<PublishPlan[]>([]);
  const relationshipsSubject = new BehaviorSubject<ElementRelationship[]>([]);
  const customTypesSubject = new BehaviorSubject<RelationshipTypeDefinition[]>(
    []
  );
  const schemasSubject = new BehaviorSubject<ElementTypeSchema[]>([]);
  const elementTagsSubject = new BehaviorSubject<ElementTag[]>([]);
  const customTagsSubject = new BehaviorSubject<TagDefinition[]>([]);
  const projectMetaSubject = new BehaviorSubject<ProjectMeta | undefined>(
    undefined
  );
  const syncStateSubject = new BehaviorSubject<DocumentSyncState>(
    DocumentSyncState.Unavailable
  );
  const errorsSubject = new Subject<string>();
  const lastConnectionErrorSubject = new BehaviorSubject<string | null>(null);

  return {
    _elementsSubject: elementsSubject,
    _publishPlansSubject: publishPlansSubject,
    _relationshipsSubject: relationshipsSubject,
    _customTypesSubject: customTypesSubject,
    _schemasSubject: schemasSubject,
    _elementTagsSubject: elementTagsSubject,
    _customTagsSubject: customTagsSubject,
    _projectMetaSubject: projectMetaSubject,
    _syncStateSubject: syncStateSubject,
    _errorsSubject: errorsSubject,
    _lastConnectionErrorSubject: lastConnectionErrorSubject,

    connect: vi.fn().mockResolvedValue({ success: true }),
    disconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getSyncState: vi.fn(() => syncStateSubject.getValue()),
    getElements: vi.fn(() => elementsSubject.getValue()),
    getPublishPlans: vi.fn(() => publishPlansSubject.getValue()),
    getRelationships: vi.fn(() => relationshipsSubject.getValue()),
    getCustomRelationshipTypes: vi.fn(() => customTypesSubject.getValue()),
    getSchemas: vi.fn(() => schemasSubject.getValue()),
    getElementTags: vi.fn(() => elementTagsSubject.getValue()),
    getCustomTags: vi.fn(() => customTagsSubject.getValue()),
    getProjectMeta: vi.fn(() => projectMetaSubject.getValue()),
    updateElements: vi.fn((elements: Element[]) => {
      elementsSubject.next(elements);
    }),
    updatePublishPlans: vi.fn((plans: PublishPlan[]) => {
      publishPlansSubject.next(plans);
    }),
    updateRelationships: vi.fn((relationships: ElementRelationship[]) => {
      relationshipsSubject.next(relationships);
    }),
    updateCustomRelationshipTypes: vi.fn(
      (types: RelationshipTypeDefinition[]) => {
        customTypesSubject.next(types);
      }
    ),
    updateSchemas: vi.fn((schemas: ElementTypeSchema[]) => {
      schemasSubject.next(schemas);
    }),
    updateElementTags: vi.fn((tags: ElementTag[]) => {
      elementTagsSubject.next(tags);
    }),
    updateCustomTags: vi.fn((tags: TagDefinition[]) => {
      customTagsSubject.next(tags);
    }),
    updateProjectMeta: vi.fn((meta: Partial<ProjectMeta>) => {
      const current = projectMetaSubject.getValue();
      projectMetaSubject.next({
        name: meta.name ?? current?.name ?? '',
        description: meta.description ?? current?.description ?? '',
        coverMediaId: meta.coverMediaId ?? current?.coverMediaId,
        updatedAt: new Date().toISOString(),
      });
    }),

    syncState$: syncStateSubject.asObservable(),
    elements$: elementsSubject.asObservable(),
    publishPlans$: publishPlansSubject.asObservable(),
    relationships$: relationshipsSubject.asObservable(),
    customRelationshipTypes$: customTypesSubject.asObservable(),
    schemas$: schemasSubject.asObservable(),
    elementTags$: elementTagsSubject.asObservable(),
    customTags$: customTagsSubject.asObservable(),
    projectMeta$: projectMetaSubject.asObservable(),
    errors$: errorsSubject.asObservable(),
    lastConnectionError$: lastConnectionErrorSubject.asObservable(),
  } as MockedObject<IElementSyncProvider> & {
    _elementsSubject: BehaviorSubject<Element[]>;
    _publishPlansSubject: BehaviorSubject<PublishPlan[]>;
    _relationshipsSubject: BehaviorSubject<ElementRelationship[]>;
    _customTypesSubject: BehaviorSubject<RelationshipTypeDefinition[]>;
    _schemasSubject: BehaviorSubject<ElementTypeSchema[]>;
    _elementTagsSubject: BehaviorSubject<ElementTag[]>;
    _customTagsSubject: BehaviorSubject<TagDefinition[]>;
    _projectMetaSubject: BehaviorSubject<ProjectMeta | undefined>;
    _syncStateSubject: BehaviorSubject<DocumentSyncState>;
    _errorsSubject: Subject<string>;
    _lastConnectionErrorSubject: BehaviorSubject<string | null>;
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
  let mockOfflineElementsService: MockedObject<LocalProjectElementsService>;
  let mockDialogGatewayService: MockedObject<DialogGatewayService>;
  let mockRecentFilesService: MockedObject<RecentFilesService>;
  let mockStorageService: MockedObject<StorageService>;
  let mockLoggerService: MockedObject<LoggerService>;
  let mockProjectSyncService: MockedObject<ProjectSyncService>;
  let mockBackgroundSyncService: MockedObject<BackgroundSyncService>;

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
      isLocalMode: vi.fn().mockReturnValue(false),
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
    } as unknown as MockedObject<LocalProjectElementsService>;

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

    mockProjectSyncService = {
      hasPendingCreation: vi.fn().mockReturnValue(false),
      hasPendingSync: vi.fn().mockReturnValue(false),
    } as unknown as MockedObject<ProjectSyncService>;

    mockBackgroundSyncService = {
      syncPendingItems: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<BackgroundSyncService>;

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
          provide: LocalProjectElementsService,
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
        { provide: ProjectSyncService, useValue: mockProjectSyncService },
        {
          provide: BackgroundSyncService,
          useValue: mockBackgroundSyncService,
        },
      ],
    });

    service = TestBed.inject(ProjectStateService);
    service.project.set(mockProject);
  });

  describe('Project Loading', () => {
    it('should load project metadata and connect sync provider', async () => {
      await service.loadProject('testuser', 'test-project');

      // Now uses UnifiedProjectService instead of raw API
      expect(mockUnifiedProjectService.getProject).toHaveBeenCalledWith(
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
      // UnifiedProjectService throws error AND sync provider fails
      mockUnifiedProjectService.getProject.mockRejectedValue(
        new Error('API Error')
      );
      mockSyncProvider.connect.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      });

      await service.loadProject('testuser', 'test-project').catch(() => {});

      expect(service.error()).toBe('Failed to load project: API Error');
      expect(service.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should handle sync provider connection failure with fallback', async () => {
      // When sync provider fails but we have project metadata, should still work
      mockSyncProvider.connect.mockResolvedValue({
        success: false,
        error: 'WebSocket connection failed',
      });
      mockSyncProvider.isConnected.mockReturnValue(false);

      await service.loadProject('testuser', 'test-project').catch(() => {});

      // Project metadata loads successfully even if sync fails
      expect(service.project()).toEqual(mockProject);
      // No error because we have project metadata
      expect(service.error()).toBeFalsy();
    });

    it('should operate in offline mode when server is down but IndexedDB works', async () => {
      // Server is down - no project metadata
      mockUnifiedProjectService.getProject.mockRejectedValue(
        new Error('Server unavailable')
      );
      // But sync provider connects via IndexedDB
      mockSyncProvider.connect.mockResolvedValue({ success: true });
      mockSyncProvider.isConnected.mockReturnValue(true);

      await service.loadProject('testuser', 'test-project');

      // Should create placeholder project
      expect(service.project()?.slug).toBe('test-project');
      expect(service.project()?.username).toBe('testuser');
      // Should set offline state
      expect(service.getSyncState()).toBe(DocumentSyncState.Local);
      expect(service.error()).toBeFalsy();
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

      // Simulate provider emitting a critical error (session expiry)
      mockSyncProvider._errorsSubject.next(
        'Session expired. Please log in again.'
      );

      expect(service.error()).toBe('Session expired. Please log in again.');
    });

    it('should NOT set error for non-critical connection issues', async () => {
      await service.loadProject('testuser', 'test-project');

      // Non-critical errors like connection issues should not block the UI
      mockSyncProvider._errorsSubject.next('Connection lost');

      // Error should remain undefined for non-critical issues
      expect(service.error()).toBeUndefined();
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
      // First document is at index 0 (no separate home tab offset)
      expect(service.selectedTabIndex()).toBe(0);
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

    it('should add root level element via sync provider', () => {
      service.addElement(ElementType.Folder, 'New Folder');

      expect(mockSyncProvider.updateElements).toHaveBeenCalled();
      const calledElements = mockSyncProvider.updateElements.mock.calls[0][0];
      expect(calledElements).toHaveLength(1);
      expect(calledElements[0].name).toBe('New Folder');
      expect(calledElements[0].level).toBe(0);
    });

    it('should add child element and auto-expand parent', () => {
      // Add parent first
      service.addElement(ElementType.Folder, 'Parent');
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
      service.addElement(ElementType.Item, 'Child', parentId);

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

  describe('Locally Created Element Tracking', () => {
    beforeEach(async () => {
      await service.loadProject('testuser', 'test-project');
    });

    it('should track locally created elements', () => {
      const elementId = service.addElement(ElementType.Item, 'New Doc');
      expect(elementId).toBeTruthy();
      expect(service.isLocallyCreatedElement(elementId!)).toBe(true);
    });

    it('should not mark remote elements as locally created', () => {
      expect(service.isLocallyCreatedElement('remote-element-id')).toBe(false);
    });

    it('should clear tracked elements when project state is cleared', async () => {
      const elementId = service.addElement(ElementType.Item, 'New Doc');
      expect(service.isLocallyCreatedElement(elementId!)).toBe(true);

      // Loading a new project clears state
      await service.loadProject('testuser', 'other-project');

      expect(service.isLocallyCreatedElement(elementId!)).toBe(false);
    });
  });

  describe('isDocumentUnavailable', () => {
    beforeEach(async () => {
      await service.loadProject('testuser', 'test-project');
    });

    it('should return false in local mode', async () => {
      mockSetupService.getMode.mockReturnValue('local');

      const result = await service.isDocumentUnavailable('any-id');
      expect(result).toBe(false);
    });

    it('should return false for locally created elements', async () => {
      const elementId = service.addElement(ElementType.Item, 'New Doc');
      expect(elementId).toBeTruthy();

      const result = await service.isDocumentUnavailable(elementId!);
      expect(result).toBe(false);
    });

    it('should return true for remote elements with no IndexedDB content', async () => {
      // Mock indexedDB.open to simulate empty database
      const mockDb = {
        objectStoreNames: { length: 0 },
        close: vi.fn(),
      };
      const mockRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: mockDb,
      };
      vi.spyOn(indexedDB, 'open').mockReturnValue(
        mockRequest as unknown as IDBOpenDBRequest
      );

      // Trigger onsuccess callback asynchronously
      const promise = service.isDocumentUnavailable('remote-element');
      queueMicrotask(() => mockRequest.onsuccess?.({} as Event));

      const result = await promise;
      expect(result).toBe(true);

      vi.restoreAllMocks();
    });

    it('should return false for remote elements with IndexedDB content', async () => {
      // Mock indexedDB.open to simulate database with object stores
      const mockDb = {
        objectStoreNames: { length: 2 },
        close: vi.fn(),
      };
      const mockRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: mockDb,
      };
      vi.spyOn(indexedDB, 'open').mockReturnValue(
        mockRequest as unknown as IDBOpenDBRequest
      );

      const promise = service.isDocumentUnavailable('synced-element');
      queueMicrotask(() => mockRequest.onsuccess?.({} as Event));

      const result = await promise;
      expect(result).toBe(false);

      vi.restoreAllMocks();
    });

    it('should use worldbuilding DB key format when elementType is worldbuilding', async () => {
      const mockDb = {
        objectStoreNames: { length: 2 },
        close: vi.fn(),
      };
      const mockRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: mockDb,
      };
      const openSpy = vi
        .spyOn(indexedDB, 'open')
        .mockReturnValue(mockRequest as unknown as IDBOpenDBRequest);

      const promise = service.isDocumentUnavailable(
        'wb-element',
        'worldbuilding'
      );
      queueMicrotask(() => mockRequest.onsuccess?.({} as Event));

      await promise;
      expect(openSpy).toHaveBeenCalledWith(
        'worldbuilding:testuser:test-project:wb-element'
      );

      vi.restoreAllMocks();
    });

    it('should use default document DB key format when elementType is document', async () => {
      const mockDb = {
        objectStoreNames: { length: 2 },
        close: vi.fn(),
      };
      const mockRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: mockDb,
      };
      const openSpy = vi
        .spyOn(indexedDB, 'open')
        .mockReturnValue(mockRequest as unknown as IDBOpenDBRequest);

      const promise = service.isDocumentUnavailable('doc-element', 'document');
      queueMicrotask(() => mockRequest.onsuccess?.({} as Event));

      await promise;
      expect(openSpy).toHaveBeenCalledWith('testuser:test-project:doc-element');

      vi.restoreAllMocks();
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

  describe('updateProject', () => {
    it('should update project and sync to Yjs', async () => {
      await service.loadProject('testuser', 'test-project');

      const updatedProject: Project = {
        id: 'project-1',
        username: 'testuser',
        slug: 'test-project',
        title: 'Updated Title',
        description: 'Updated description',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      service.updateProject(updatedProject);

      expect(service.project()?.title).toBe('Updated Title');
      expect(mockSyncProvider.updateProjectMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Title',
          description: 'Updated description',
        })
      );
    });

    it('should update coverMediaId when provided', async () => {
      await service.loadProject('testuser', 'test-project');

      const updatedProject: Project = {
        id: 'project-1',
        username: 'testuser',
        slug: 'test-project',
        title: 'Test Project',
        description: 'Test description',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      service.updateProject(updatedProject, 'cover-abc123');

      expect(service.coverMediaId()).toBe('cover-abc123');
      expect(mockSyncProvider.updateProjectMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          coverMediaId: 'cover-abc123',
        })
      );
    });

    it('should not sync to Yjs if metadata unchanged', async () => {
      await service.loadProject('testuser', 'test-project');
      const originalProject = service.project();
      mockSyncProvider.updateProjectMeta.mockClear();

      // Update with same values
      service.updateProject(originalProject!);

      // Should not have called updateProjectMeta since nothing changed
      expect(mockSyncProvider.updateProjectMeta).not.toHaveBeenCalled();
    });
  });

  describe('coverMediaId from projectMeta$', () => {
    it('should update coverMediaId when projectMeta$ emits', async () => {
      await service.loadProject('testuser', 'test-project');

      // Initially undefined
      expect(service.coverMediaId()).toBeUndefined();

      // Emit project meta with coverMediaId
      mockSyncProvider._projectMetaSubject.next({
        name: 'Test Project',
        description: '',
        coverMediaId: 'cover-xyz789',
        updatedAt: new Date().toISOString(),
      });

      // Wait for microtask to complete (subscription is deferred)
      await new Promise<void>(resolve => queueMicrotask(() => resolve()));

      expect(service.coverMediaId()).toBe('cover-xyz789');
    });
  });

  describe('Cleanup', () => {
    it('should disconnect provider on destroy', async () => {
      await service.loadProject('testuser', 'test-project');

      service.ngOnDestroy();

      expect(mockSyncProvider.disconnect).toHaveBeenCalled();
    });
  });

  describe('deletePublishPlan', () => {
    const mockPlan = {
      id: 'plan-abc',
      name: 'My Plan',
      format: PublishFormat.PDF_SIMPLE,
    } as unknown as PublishPlan;

    it('should remove plan from publishPlans and call closeTabById with publish-plan- prefix', async () => {
      await service.loadProject('testuser', 'test-project');
      service.createPublishPlan(mockPlan);

      const tabManager = TestBed.inject(TabManagerService);
      const closeSpy = vi.spyOn(tabManager, 'closeTabById');

      service.deletePublishPlan('plan-abc');

      expect(
        service.publishPlans().find(p => p.id === 'plan-abc')
      ).toBeUndefined();
      expect(closeSpy).toHaveBeenCalledWith('publish-plan-plan-abc');
    });

    it('should warn and do nothing when plan not found', async () => {
      await service.loadProject('testuser', 'test-project');

      const tabManager = TestBed.inject(TabManagerService);
      const closeSpy = vi.spyOn(tabManager, 'closeTabById');

      service.deletePublishPlan('nonexistent-id');

      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('syncPendingCreation', () => {
    it('should skip sync when no pending creation', async () => {
      mockProjectSyncService.hasPendingCreation.mockReturnValue(false);

      await service.loadProject('testuser', 'test-project');

      expect(mockBackgroundSyncService.syncPendingItems).not.toHaveBeenCalled();
    });

    it('should sync pending creation before loading project', async () => {
      mockProjectSyncService.hasPendingCreation.mockReturnValue(true);
      mockBackgroundSyncService.syncPendingItems.mockResolvedValue(true);

      await service.loadProject('testuser', 'test-project');

      expect(mockBackgroundSyncService.syncPendingItems).toHaveBeenCalled();
      expect(mockLoggerService.info).toHaveBeenCalledWith(
        'ProjectState',
        expect.stringContaining('Successfully synced')
      );
    });

    it('should warn but continue when sync partially fails', async () => {
      mockProjectSyncService.hasPendingCreation.mockReturnValue(true);
      mockBackgroundSyncService.syncPendingItems.mockResolvedValue(false);

      await service.loadProject('testuser', 'test-project');

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'ProjectState',
        expect.stringContaining('partially failed')
      );
      // Should still continue loading
      expect(service.project()).toBeDefined();
    });

    it('should handle sync error gracefully and continue', async () => {
      mockProjectSyncService.hasPendingCreation.mockReturnValue(true);
      mockBackgroundSyncService.syncPendingItems.mockRejectedValue(
        new Error('Sync failed')
      );

      await service.loadProject('testuser', 'test-project');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'ProjectState',
        expect.stringContaining('Failed to sync pending creation'),
        expect.any(Error)
      );
      // Should still continue loading
      expect(service.project()).toBeDefined();
    });
  });

  describe('handleOfflineMode', () => {
    it('should set error when not connected and no project', async () => {
      mockUnifiedProjectService.getProject.mockRejectedValue(
        new Error('Server down')
      );
      mockSyncProvider.connect.mockResolvedValue({
        success: false,
        error: 'Connection failed',
      });
      mockSyncProvider.isConnected.mockReturnValue(false);

      await service.loadProject('testuser', 'test-project');

      expect(service.error()).toBeTruthy();
    });
  });

  describe('restoreOpenedDocumentsFromCache', () => {
    it('should resolve tab index for system tab URL', async () => {
      const cachedTabs: AppTab[] = [
        { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
        { id: 'media-tab', name: 'Media', type: 'system', systemType: 'media' },
        {
          id: 'docs-tab',
          name: 'Documents',
          type: 'system',
          systemType: 'documents-list',
        },
      ];

      mockStorageService.get
        .mockResolvedValueOnce(cachedTabs) // tabs cache
        .mockResolvedValue(null);

      // Mock window.location.pathname to have 'media' as last segment
      const origPathname = window.location.pathname;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: '/testuser/test-project/media' },
        writable: true,
      });

      await service.loadProject('testuser', 'test-project');

      const tabManager = TestBed.inject(TabManagerService);
      // Tab at index 1 is the media tab
      expect(tabManager.selectedTabIndex()).toBe(1);

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: origPathname },
        writable: true,
      });
    });

    it('should resolve tab index for document ID URL', async () => {
      const docElement: Element = {
        ...mockElementDto,
        id: 'doc-123',
        name: 'Test Doc',
      };
      const cachedTabs: AppTab[] = [
        { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
        {
          id: 'doc-123',
          name: 'Test Doc',
          type: 'document',
          element: docElement,
        } as AppTab,
      ];

      mockStorageService.get
        .mockResolvedValueOnce(cachedTabs)
        .mockResolvedValue(null);

      const origPathname = window.location.pathname;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          pathname: '/testuser/test-project/doc-123',
        },
        writable: true,
      });

      // Element must exist in elements() for tab validation
      mockSyncProvider._elementsSubject.next([docElement]);

      await service.loadProject('testuser', 'test-project');

      const tabManager = TestBed.inject(TabManagerService);
      expect(tabManager.selectedTabIndex()).toBe(1);

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: origPathname },
        writable: true,
      });
    });

    it('should default to index 0 when URL matches project slug', async () => {
      const cachedTabs: AppTab[] = [
        { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
        { id: 'media-tab', name: 'Media', type: 'system', systemType: 'media' },
      ];

      mockStorageService.get
        .mockResolvedValueOnce(cachedTabs)
        .mockResolvedValue(null);

      const origPathname = window.location.pathname;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          pathname: '/testuser/test-project',
        },
        writable: true,
      });

      await service.loadProject('testuser', 'test-project');

      const tabManager = TestBed.inject(TabManagerService);
      expect(tabManager.selectedTabIndex()).toBe(0);

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: origPathname },
        writable: true,
      });
    });

    it('should default to index 0 for unknown URL segment', async () => {
      const cachedTabs: AppTab[] = [
        { id: 'home', name: 'Home', type: 'system', systemType: 'home' },
        { id: 'media-tab', name: 'Media', type: 'system', systemType: 'media' },
      ];

      mockStorageService.get
        .mockResolvedValueOnce(cachedTabs)
        .mockResolvedValue(null);

      const origPathname = window.location.pathname;
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          pathname: '/testuser/test-project/nonexistent-id',
        },
        writable: true,
      });

      await service.loadProject('testuser', 'test-project');

      const tabManager = TestBed.inject(TabManagerService);
      expect(tabManager.selectedTabIndex()).toBe(0);

      Object.defineProperty(window, 'location', {
        value: { ...window.location, pathname: origPathname },
        writable: true,
      });
    });
  });
});
