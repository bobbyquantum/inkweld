import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  ProjectAPIService,
  ProjectDto,
  ProjectElementDto,
  UserDto,
} from '@worm/index';
import { of, throwError } from 'rxjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';

import { EditProjectDialogComponent } from '../dialogs/edit-project-dialog/edit-project-dialog.component';
import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectElement } from '../models/project-element';
import { ProjectStateService } from './project-state.service';
import { TreeManipulator } from './tree-manipulator';

// Create a mock map that will be reused
const mockYjsMap = {
  set: jest.fn(),
  get: jest.fn().mockImplementation(key => {
    if (key === 'elements') return [];
    return null;
  }),
  has: jest.fn().mockReturnValue(true),
  observe: jest.fn(),
};

// Mock Y.Doc and related classes
jest.mock('y-websocket');
jest.mock('y-indexeddb');
jest.mock('yjs', () => {
  const actual = jest.requireActual('yjs');
  return {
    ...actual,
    Doc: jest.fn().mockImplementation(() => ({
      getMap: jest.fn().mockReturnValue(mockYjsMap),
      transact: jest.fn(fn => fn()),
    })),
    Array: jest.fn().mockImplementation(() => ({
      toArray: jest.fn().mockReturnValue([]),
      push: jest.fn(),
      delete: jest.fn(),
      observeDeep: jest.fn(),
    })),
    Map: jest.fn().mockImplementation(() => mockYjsMap),
  };
});

// Mock TreeManipulator class
jest.mock('./tree-manipulator', () => {
  const mockMethods = {
    sourceData: [],
    getData: jest.fn().mockReturnValue([]),
    addNode: jest.fn().mockImplementation((type, parent, name) => ({
      id: 'new-element-id',
      name,
      type,
      level: 0,
      position: 0,
      expandable: true,
      expanded: false,
      visible: true,
      version: 0,
      metadata: {},
    })),
    renameNode: jest.fn(),
    deleteNode: jest.fn(),
    moveNode: jest.fn(),
    updateVisibility: jest.fn(),
    getValidDropLevels: jest
      .fn()
      .mockReturnValue({ levels: [0, 1], defaultLevel: 0 }),
    getDropInsertIndex: jest.fn().mockReturnValue(0),
    isValidDrop: jest.fn().mockReturnValue(true),
    toggleExpanded: jest.fn(),
  };

  return {
    TreeManipulator: jest.fn(() => mockMethods),
  };
});

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockDialog: jest.Mocked<MatDialog>;
  let mockProjectAPI: jest.Mocked<ProjectAPIService>;
  let mockWebsocketProvider: jest.Mocked<WebsocketProvider>;
  let mockIndexeddbProvider: jest.Mocked<IndexeddbPersistence>;
  let mockTreeManipulator: TreeManipulator;

  const mockDate = new Date('2025-02-22T22:43:16.240Z');

  const mockUser: UserDto = {
    username: 'testuser',
  } as unknown as UserDto;

  const mockProject: ProjectDto = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    user: mockUser,
    createdDate: mockDate.toISOString(),
    updatedDate: mockDate.toISOString(),
  };

  const mockElementDto: ProjectElementDto = {
    id: '1',
    name: 'Test Element',
    type: ProjectElementDto.TypeEnum.Folder,
    level: 0,
    position: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };

  const mockElement: ProjectElement = {
    ...mockElementDto,
    expanded: false,
    visible: true,
  };

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockDialog = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatDialog>;

    mockProjectAPI = {
      projectControllerGetProjectByUsernameAndSlug: jest
        .fn()
        .mockReturnValue(of(mockProject)),
      projectElementControllerUploadImage: jest.fn().mockReturnValue(of({})),
    } as unknown as jest.Mocked<ProjectAPIService>;

    mockWebsocketProvider = {
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WebsocketProvider>;

    mockIndexeddbProvider = {
      whenSynced: Promise.resolve(),
    } as unknown as jest.Mocked<IndexeddbPersistence>;

    // Mock constructors
    (WebsocketProvider as jest.Mock).mockImplementation(
      () => mockWebsocketProvider
    );
    (IndexeddbPersistence as jest.Mock).mockImplementation(
      () => mockIndexeddbProvider
    );

    // Mock Yjs responses
    mockYjsMap.get
      .mockReturnValueOnce('1')
      .mockReturnValueOnce('Test Project')
      .mockReturnValueOnce('Test Description')
      .mockReturnValueOnce(mockUser);

    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: ProjectAPIService, useValue: mockProjectAPI },
      ],
    });

    service = TestBed.inject(ProjectStateService);

    // Create a new instance of TreeManipulator with spied methods
    mockTreeManipulator = new TreeManipulator();
    jest.spyOn(mockTreeManipulator, 'moveNode');
    jest.spyOn(mockTreeManipulator, 'renameNode');
    jest.spyOn(mockTreeManipulator, 'deleteNode');
    jest.spyOn(mockTreeManipulator, 'addNode');
    jest.spyOn(mockTreeManipulator, 'updateVisibility');
    jest.spyOn(mockTreeManipulator, 'getValidDropLevels').mockReturnValue({
      levels: [0, 1],
      defaultLevel: 0,
    });
    jest.spyOn(mockTreeManipulator, 'getDropInsertIndex').mockReturnValue(0);
  });

  describe('Project Loading', () => {
    it('should load project metadata and initialize Yjs document', async () => {
      await service.loadProject('testuser', 'test-project');

      expect(
        mockProjectAPI.projectControllerGetProjectByUsernameAndSlug
      ).toHaveBeenCalledWith('testuser', 'test-project');
      expect(service.project()).toEqual(mockProject);
      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
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

  describe('File Management', () => {
    it('should open a file in editor tabs', () => {
      service.openFile(mockElementDto);

      expect(service.openFiles()).toContain(mockElementDto);
      expect(service.selectedTabIndex()).toBe(1);
    });

    it('should not duplicate already open files', () => {
      service.openFile(mockElementDto);
      service.openFile(mockElementDto);

      expect(service.openFiles()).toHaveLength(1);
    });

    it('should close a file and update selected tab', () => {
      service.openFile(mockElementDto);
      service.selectedTabIndex.set(0);
      service.closeFile(0);

      expect(service.openFiles()).toHaveLength(0);
      expect(service.selectedTabIndex()).toBe(-1);
    });
  });

  describe('Sync State Management', () => {
    it('should update sync state and handle provider connections', () => {
      // Set provider before testing
      service['provider'] = mockWebsocketProvider;

      service.updateSyncState('test-doc', DocumentSyncState.Offline);
      expect(service.getSyncState()).toBe(DocumentSyncState.Offline);
      expect(mockWebsocketProvider.disconnect).toHaveBeenCalled();

      service.updateSyncState('test-doc', DocumentSyncState.Synced);
      expect(service.getSyncState()).toBe(DocumentSyncState.Synced);
      expect(mockWebsocketProvider.connect).toHaveBeenCalled();
    });
  });

  describe('Element Management', () => {
    it('should handle image uploads for image elements', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      service.project.set(mockProject);

      await service.createTreeElement(
        ProjectElementDto.TypeEnum.Image,
        'New Image',
        mockElement,
        file
      );

      expect(
        mockProjectAPI.projectElementControllerUploadImage
      ).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'new-element-id',
        file
      );
    });

    it('should rename tree elements', async () => {
      const mockInstance = mockTreeManipulator;
      await service.renameTreeElement(mockElement, 'New Name');
      expect(mockInstance.renameNode).toHaveBeenCalledWith(
        mockElement,
        'New Name'
      );
    });

    it('should delete tree elements', async () => {
      const mockInstance = mockTreeManipulator;
      await service.deleteTreeElement(mockElement);
      expect(mockInstance.deleteNode).toHaveBeenCalledWith(mockElement);
    });
  });

  describe('Project Updates', () => {
    it('should update project metadata', () => {
      const updatedProject = {
        ...mockProject,
        title: 'Updated Title',
        description: 'Updated Description',
      };

      mockDialog.open.mockReturnValue({
        afterClosed: () => of(updatedProject),
      } as MatDialogRef<EditProjectDialogComponent, ProjectDto>);

      service.showEditProjectDialog();

      expect(mockDialog.open).toHaveBeenCalledWith(
        EditProjectDialogComponent,
        expect.objectContaining({
          data: service.project(),
        })
      );
    });

    // it('should handle errors during project update', async () => {
    //   // Mock Y.Doc to throw an error during transaction
    //   (Y.Doc as jest.Mock).mockImplementationOnce(() => ({
    //     getMap: () => {
    //       throw new Error('Failed to update project');
    //     },
    //   }));

    //   const updatedProject = {
    //     ...mockProject,
    //     title: 'Updated Title',
    //   };

    //   await service.updateProject(updatedProject).catch(() => {});

    //   expect(service.error()).toBe('Failed to update project');
    // });
  });

  describe('Project Elements Loading', () => {
    it('should load project elements from Yjs doc', async () => {
      await service
        .loadProjectElements('testuser', 'test-project')
        .catch(() => {});
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
    });

    // it('should handle errors during element loading', async () => {
    //   // Mock Y.Doc to throw an error
    //   (Y.Doc as jest.Mock).mockImplementationOnce(() => ({
    //     getMap: () => {
    //       throw new Error('Failed to load project elements');
    //     },
    //   }));

    //   await service
    //     .loadProjectElements('testuser', 'test-project')
    //     .catch(() => {});
    //   expect(service.error()).toBe('Failed to load project elements');
    // });
  });

  describe('Tree Manipulation', () => {
    beforeEach(() => {
      service['treeManipulator'] = mockTreeManipulator;
    });

    it('should move tree elements', async () => {
      const node = mockElement;
      const targetIndex = 2;
      const newLevel = 1;
      const mockInstance = mockTreeManipulator;

      await service.moveTreeElement(node, targetIndex, newLevel);
      expect(mockInstance.moveNode).toHaveBeenCalledWith(
        node,
        targetIndex,
        newLevel
      );
    });

    it('should calculate valid drop levels', () => {
      const nodeAbove: ProjectElement = {
        ...mockElement,
        id: 'above',
        type: ProjectElementDto.TypeEnum.Folder,
      };

      const nodeBelow: ProjectElement = {
        ...mockElement,
        id: 'below',
        type: ProjectElementDto.TypeEnum.Item,
      };

      const result = service.getValidDropLevels(nodeAbove, nodeBelow);
      expect(result).toEqual({ levels: [0, 1], defaultLevel: 0 });
    });

    it('should validate drop operations', () => {
      const nodeAbove: ProjectElement = {
        ...mockElement,
        type: ProjectElementDto.TypeEnum.Folder,
      };

      const result = service.isValidDrop(nodeAbove, 1);
      expect(result).toBe(true);
    });

    it('should calculate drop insert index', () => {
      const nodeAbove: ProjectElement = {
        ...mockElement,
        type: ProjectElementDto.TypeEnum.Folder,
      };

      const index = service.getDropInsertIndex(nodeAbove, 1);
      expect(index).toBe(0);
    });
  });

  describe('Visibility Management', () => {
    beforeEach(() => {
      service['treeManipulator'] = mockTreeManipulator;
    });

    it('should update visibility of tree elements', () => {
      const elements = [
        {
          ...mockElement,
          id: '1',
          expanded: true,
        },
        {
          ...mockElement,
          id: '2',
          level: 1,
        },
      ];

      service.elements.set(elements);
      service.updateVisibility();
      expect(mockTreeManipulator.updateVisibility).toHaveBeenCalled();
    });

    it('should toggle element expansion', () => {
      const element: ProjectElement = {
        ...mockElement,
        expanded: false,
      };

      service.elements.set([element]);
      service.toggleExpanded(element);

      expect(element.expanded).toBe(true);
      expect(mockTreeManipulator.updateVisibility).toHaveBeenCalled();
    });
  });
});
