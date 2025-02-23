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
import * as Y from 'yjs';

import { EditProjectDialogComponent } from '../dialogs/edit-project-dialog/edit-project-dialog.component';
import { DocumentSyncState } from '../models/document-sync-state';
import { ProjectStateService } from './project-state.service';

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

// Mock array to track elements
let mockElements: ProjectElementDto[] = [];

// Create a properly typed mock Y.Array
const createMockYArray = () => ({
  toArray: jest.fn().mockImplementation(() => mockElements),
  delete: jest.fn().mockImplementation((start: number, length: number) => {
    mockElements.splice(start, length);
  }),
  insert: jest
    .fn()
    .mockImplementation((index: number, elements: ProjectElementDto[]) => {
      mockElements.splice(index, 0, ...elements);
    }),
  observe: jest.fn(),
});

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
      getArray: jest.fn().mockReturnValue(createMockYArray()),
    })),
    Array: jest.fn().mockImplementation(() => createMockYArray()),
    Map: jest.fn().mockImplementation(() => mockYjsMap),
  };
});

describe('ProjectStateService', () => {
  let service: ProjectStateService;
  let mockDialog: jest.Mocked<MatDialog>;
  let mockProjectAPI: jest.Mocked<ProjectAPIService>;
  let mockWebsocketProvider: jest.Mocked<WebsocketProvider>;
  let mockIndexeddbProvider: jest.Mocked<IndexeddbPersistence>;

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

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Reset mock elements
    mockElements = [];

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
    service.project.set(mockProject);

    // Initialize the Yjs document
    service['doc'] = new Y.Doc();
    // Initialize elements array
    service['initializeFromDoc']();
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
      expect(service.selectedTabIndex()).toBe(0);
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
      service['updateProject'](updatedProject);

      expect(mockDialog.open).toHaveBeenCalledWith(
        EditProjectDialogComponent,
        expect.objectContaining({
          data: mockProject,
        })
      );

      expect(service.project()).toEqual(updatedProject);
      expect(mockYjsMap.set).toHaveBeenCalledWith('title', 'Updated Title');
      expect(mockYjsMap.set).toHaveBeenCalledWith(
        'description',
        'Updated Description'
      );
    });
  });

  describe('Element Management', () => {
    it('should add root level element', async () => {
      await service.addElement(ProjectElementDto.TypeEnum.Folder, 'New Folder');
      const elements = service.elements();

      expect(elements).toHaveLength(1);
      expect(elements[0].name).toBe('New Folder');
      expect(elements[0].level).toBe(0);
      expect(elements[0].position).toBe(0);
    });

    it('should add child element and auto-expand parent', async () => {
      const parent: ProjectElementDto = {
        id: 'parent',
        name: 'Parent',
        type: ProjectElementDto.TypeEnum.Folder,
        level: 0,
        position: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };

      mockElements = [parent];
      service['initializeFromDoc']();

      await service.addElement(
        ProjectElementDto.TypeEnum.Item,
        'New Item',
        'parent'
      );

      const elements = service.elements();
      expect(elements).toHaveLength(2);
      expect(elements[1].name).toBe('New Item');
      expect(elements[1].level).toBe(1);
      expect(service.isExpanded('parent')).toBe(true);
    });

    it('should handle image upload when adding image element', async () => {
      const imageFile = new File(['test'], 'test.png', { type: 'image/png' });
      service.project.set(mockProject);

      await service.addElement(
        ProjectElementDto.TypeEnum.Image,
        'New Image',
        undefined,
        imageFile
      );

      expect(
        mockProjectAPI.projectElementControllerUploadImage
      ).toHaveBeenCalledWith(
        mockProject.user!.username,
        mockProject.slug,
        expect.any(String),
        imageFile
      );
    });

    it('should handle image upload failure', async () => {
      const imageFile = new File(['test'], 'test.png', { type: 'image/png' });
      service.project.set(mockProject);

      mockProjectAPI.projectElementControllerUploadImage.mockReturnValue(
        throwError(() => new Error('Upload failed'))
      );

      await expect(
        service.addElement(
          ProjectElementDto.TypeEnum.Image,
          'New Image',
          undefined,
          imageFile
        )
      ).rejects.toThrow('Failed to upload image');

      // Verify the element was removed after failed upload
      expect(service.elements()).toHaveLength(0);
    });

    it('should maintain correct positions when adding elements', async () => {
      await service.addElement(ProjectElementDto.TypeEnum.Folder, 'Folder 1');
      const folder1 = service.elements()[0];
      await service.addElement(ProjectElementDto.TypeEnum.Folder, 'Folder 2');
      await service.addElement(
        ProjectElementDto.TypeEnum.Item,
        'Item 1',
        folder1.id
      );

      const elements = service.elements();
      expect(elements).toHaveLength(3);
      expect(elements.map(e => e.position)).toEqual([0, 2, 1]);
      expect(elements.map(e => e.name)).toEqual([
        'Folder 1',
        'Folder 2',
        'Item 1',
      ]);
    });
  });

  describe('Tree Operations', () => {
    it('should move element and its subtree', () => {
      const elements: ProjectElementDto[] = [
        {
          id: 'root1',
          name: 'Root 1',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 0,
          position: 0,
          expandable: true,
          version: 0,
          metadata: {},
        },
        {
          id: 'child1',
          name: 'Child 1',
          type: ProjectElementDto.TypeEnum.Item,
          level: 1,
          position: 1,
          expandable: false,
          version: 0,
          metadata: {},
        },
        {
          id: 'root2',
          name: 'Root 2',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 0,
          position: 2,
          expandable: true,
          version: 0,
          metadata: {},
        },
      ];

      mockElements = elements;
      service['initializeFromDoc']();
      service.moveElement('root1', 2, 0);

      const movedElements = service.elements();
      expect(movedElements.map(e => e.id)).toEqual([
        'root2',
        'root1',
        'child1',
      ]);
      expect(movedElements.map(e => e.position)).toEqual([0, 1, 2]);
      expect(movedElements[2].level).toBe(1); // Child maintains relative level
    });

    it('should delete element and its subtree', () => {
      const elements: ProjectElementDto[] = [
        {
          id: 'root',
          name: 'Root',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 0,
          position: 0,
          expandable: true,
          version: 0,
          metadata: {},
        },
        {
          id: 'child1',
          name: 'Child 1',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 1,
          position: 1,
          expandable: true,
          version: 0,
          metadata: {},
        },
        {
          id: 'grandchild',
          name: 'Grandchild',
          type: ProjectElementDto.TypeEnum.Item,
          level: 2,
          position: 2,
          expandable: false,
          version: 0,
          metadata: {},
        },
      ];

      mockElements = elements;
      service['initializeFromDoc']();
      service.setExpanded('root', true);
      service.setExpanded('child1', true);

      service.deleteElement('child1');

      const remainingElements = service.elements();
      expect(remainingElements).toHaveLength(1);
      expect(remainingElements[0].id).toBe('root');
      expect(service.isExpanded('child1')).toBe(false);
    });

    describe('Drop Validation', () => {
      it('should validate root level drops', () => {
        expect(service.isValidDrop(null, 0)).toBe(true);
        expect(service.isValidDrop(null, 1)).toBe(true);
        expect(service.isValidDrop(null, 2)).toBe(false);
      });

      it('should validate drops relative to folders', () => {
        const folder: ProjectElementDto = {
          id: 'folder',
          name: 'Folder',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 1,
          position: 0,
          expandable: true,
          version: 0,
          metadata: {},
        };

        expect(service.isValidDrop(folder, 1)).toBe(true); // Same level
        expect(service.isValidDrop(folder, 2)).toBe(true); // One level deeper
        expect(service.isValidDrop(folder, 3)).toBe(false); // Too deep
      });

      it('should validate drops relative to items', () => {
        const item: ProjectElementDto = {
          id: 'item',
          name: 'Item',
          type: ProjectElementDto.TypeEnum.Item,
          level: 1,
          position: 0,
          expandable: false,
          version: 0,
          metadata: {},
        };

        expect(service.isValidDrop(item, 1)).toBe(true); // Same level
        expect(service.isValidDrop(item, 2)).toBe(false); // Can't nest under item
      });

      it('should validate drops relative to images', () => {
        const image: ProjectElementDto = {
          id: 'image',
          name: 'Image',
          type: ProjectElementDto.TypeEnum.Image,
          level: 1,
          position: 0,
          expandable: false,
          version: 0,
          metadata: {},
        };

        expect(service.isValidDrop(image, 1)).toBe(true); // Same level
        expect(service.isValidDrop(image, 2)).toBe(false); // Can't nest under image
      });
    });
  });

  describe('Visible Elements', () => {
    it('should return empty array when no elements exist', () => {
      service.elements.set([]);
      expect(service.visibleElements()).toEqual([]);
    });

    it('should show root level elements', () => {
      const rootElement: ProjectElementDto = {
        id: 'root',
        name: 'Root',
        type: ProjectElementDto.TypeEnum.Folder,
        level: 0,
        position: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };

      mockElements = [rootElement];
      service['initializeFromDoc']();
      const visible = service.visibleElements();

      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe('root');
      expect(visible[0].expanded).toBe(false);
    });

    it('should show children when parent is expanded', () => {
      const parent: ProjectElementDto = {
        id: 'parent',
        name: 'Parent',
        type: ProjectElementDto.TypeEnum.Folder,
        level: 0,
        position: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };

      const child: ProjectElementDto = {
        id: 'child',
        name: 'Child',
        type: ProjectElementDto.TypeEnum.Item,
        level: 1,
        position: 1,
        expandable: false,
        version: 0,
        metadata: {},
      };

      mockElements = [parent, child];
      service['initializeFromDoc']();
      service.setExpanded('parent', true);
      const visible = service.visibleElements();

      expect(visible).toHaveLength(2);
      expect(visible[0].id).toBe('parent');
      expect(visible[0].expanded).toBe(true);
      expect(visible[1].id).toBe('child');
    });

    it('should hide children when parent is collapsed', () => {
      const parent: ProjectElementDto = {
        id: 'parent',
        name: 'Parent',
        type: ProjectElementDto.TypeEnum.Folder,
        level: 0,
        position: 0,
        expandable: true,
        version: 0,
        metadata: {},
      };

      const child: ProjectElementDto = {
        id: 'child',
        name: 'Child',
        type: ProjectElementDto.TypeEnum.Item,
        level: 1,
        position: 1,
        expandable: false,
        version: 0,
        metadata: {},
      };

      mockElements = [parent, child];
      service['initializeFromDoc']();
      const visible = service.visibleElements();

      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe('parent');
      expect(visible[0].expanded).toBe(false);
    });

    it('should handle multiple levels of nesting with mixed expanded states', () => {
      const elements: ProjectElementDto[] = [
        {
          id: 'root',
          name: 'Root',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 0,
          position: 0,
          expandable: true,
          version: 0,
          metadata: {},
        },
        {
          id: 'child1',
          name: 'Child 1',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 1,
          position: 1,
          expandable: true,
          version: 0,
          metadata: {},
        },
        {
          id: 'grandchild1',
          name: 'Grandchild 1',
          type: ProjectElementDto.TypeEnum.Item,
          level: 2,
          position: 2,
          expandable: false,
          version: 0,
          metadata: {},
        },
        {
          id: 'child2',
          name: 'Child 2',
          type: ProjectElementDto.TypeEnum.Folder,
          level: 1,
          position: 3,
          expandable: true,
          version: 0,
          metadata: {},
        },
      ];

      mockElements = elements;
      service['initializeFromDoc']();
      service.setExpanded('root', true);
      service.setExpanded('child1', true);
      const visible = service.visibleElements();

      expect(visible).toHaveLength(4);
      expect(visible[0].id).toBe('root');
      expect(visible[0].expanded).toBe(true);
      expect(visible[1].id).toBe('child1');
      expect(visible[1].expanded).toBe(true);
      expect(visible[2].id).toBe('grandchild1');
      expect(visible[3].id).toBe('child2');
      expect(visible[3].expanded).toBe(false);
    });
  });
});
