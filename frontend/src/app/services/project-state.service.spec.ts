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

      expect(mockDialog.open).toHaveBeenCalledWith(
        EditProjectDialogComponent,
        expect.objectContaining({
          data: service.project(),
        })
      );
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

      service.elements.set([rootElement]);
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

      service.elements.set([parent, child]);
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

      service.elements.set([parent, child]);
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

      service.elements.set(elements);
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
