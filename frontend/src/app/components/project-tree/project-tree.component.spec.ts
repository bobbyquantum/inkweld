import {
  CdkDrag,
  CdkDragDrop,
  CdkDragMove,
  CdkDragSortEvent,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import {
  provideZonelessChangeDetection,
  signal,
  WritableSignal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementType } from '@inkweld/index';
import { ProjectsService } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  MockedObject,
  vi,
} from 'vitest';

import { projectServiceMock } from '../../../testing/project-api.mock';
import { ProjectElement } from '../../models/project-element';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { ProjectTreeComponent } from './project-tree.component';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;
  let projectStateService: MockedObject<ProjectStateService>;
  let settingsService: MockedObject<SettingsService>;
  let elementsSignal: WritableSignal<ProjectElement[]>;
  let visibleElementsSignal: WritableSignal<ProjectElement[]>;
  let loadingSignal: WritableSignal<boolean>;
  let savingSignal: WritableSignal<boolean>;
  let errorSignal: WritableSignal<string | undefined>;
  let selectedTabIndexSignal: WritableSignal<number>;
  let openTabsSignal: WritableSignal<{ systemType?: string }[]>;
  let dialogGatewayService: MockedObject<DialogGatewayService>;

  const mockDto: ProjectElement = {
    id: '1',
    name: 'Test Element',
    type: ElementType.Folder,
    order: 0,
    level: 1,
    expandable: false,
    version: 0,
    metadata: {},
    visible: true,
    parentId: null,
  };

  const setupTestBed = async () => {
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/testuser/testproject',
      },
      writable: true,
    });

    elementsSignal = signal<ProjectElement[]>([mockDto]);
    visibleElementsSignal = signal<ProjectElement[]>([mockDto]);
    loadingSignal = signal(false);
    savingSignal = signal(false);
    errorSignal = signal<string | undefined>(undefined);
    selectedTabIndexSignal = signal(0);
    openTabsSignal = signal<{ systemType?: string }[]>([
      { systemType: 'home' },
    ]);

    settingsService = {
      getSetting: vi.fn().mockReturnValue(false),
    } as unknown as MockedObject<SettingsService>;

    projectStateService = {
      elements: elementsSignal,
      visibleElements: visibleElementsSignal,
      isLoading: loadingSignal,
      isSaving: savingSignal,
      error: errorSignal,
      openTabs: openTabsSignal,
      selectedTabIndex: selectedTabIndexSignal,
      project: signal({
        title: 'Test Project',
        username: 'testuser',
        slug: 'testproject',
      }),
      canWrite: signal(true),
      saveProjectElements: vi.fn().mockResolvedValue(undefined),
      showEditProjectDialog: vi.fn(),
      openDocument: vi.fn(),
      updateProject: vi.fn(),
      renameNode: vi.fn(),
      showNewElementDialog: vi.fn(),
      toggleExpanded: vi.fn(),
      moveElement: vi.fn().mockResolvedValue(undefined),
      renameElement: vi.fn().mockResolvedValue(undefined),
      deleteElement: vi.fn().mockResolvedValue(undefined),
      closeTabByElementId: vi.fn(),
      getValidDropLevels: vi
        .fn()
        .mockReturnValue({ levels: [1], defaultLevel: 1 }),
      getDropInsertIndex: vi.fn().mockReturnValue(1),
      isValidDrop: vi.fn().mockReturnValue(true),
      setExpanded: vi.fn(),
      selectTab: vi.fn(),
      openSystemTab: vi.fn(),
    } as unknown as MockedObject<ProjectStateService>;

    dialogGatewayService = {
      openConfirmationDialog: vi.fn().mockResolvedValue(true),
      openRenameDialog: vi.fn().mockResolvedValue('New Name'),
      openEditProjectDialog: vi.fn().mockResolvedValue(null),
      openNewElementDialog: vi.fn().mockResolvedValue(null),
    } as unknown as MockedObject<DialogGatewayService>;

    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SettingsService, useValue: settingsService },
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: ProjectsService, useValue: projectServiceMock },
        provideHttpClient(),
        { provide: DialogGatewayService, useValue: dialogGatewayService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await setupTestBed();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with elements from service', () => {
    expect(component.treeElements()).toHaveLength(1);
    expect(component.treeElements()[0].type).toBe('FOLDER');
    expect(component.treeElements()[0].level).toBe(1);
  });

  describe('State Management', () => {
    it('should handle loading, saving and error states', () => {
      loadingSignal.set(true);
      expect(component.isLoading()).toBe(true);

      savingSignal.set(true);
      expect(component.isSaving()).toBe(true);

      const errorMessage = 'Test error';
      errorSignal.set(errorMessage);
      expect(component.error()).toBe(errorMessage);

      errorSignal.set(undefined);
      expect(component.error()).toBeUndefined();
    });
  });

  describe('Drag and Drop', () => {
    let mockDrag: CdkDrag<ProjectElement>;
    let _mockDropList: CdkDropList<ProjectElement[]>;
    let node: ProjectElement;

    const createTestDragEvent = (
      invalid = false
    ): CdkDragDrop<ProjectElement[], ProjectElement[], ProjectElement> => ({
      previousIndex: 0,
      currentIndex: 1,
      item: {
        data: invalid
          ? { ...mockDto, id: undefined, order: undefined }
          : mockDto,
      } as CdkDrag<ProjectElement>,
      container: {
        data: [mockDto],
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ProjectElement[]>,
      previousContainer: {
        data: [mockDto],
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ProjectElement[]>,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
      dropPoint: { x: 0, y: 0 },
    });

    describe('Drop Handling', () => {
      it('should handle valid drops without confirmation', () => {
        settingsService.getSetting.mockReturnValue(false); // confirmElementMoves disabled

        // Set up the dragged node for the test
        component.draggedNode = mockDto;
        const event = createTestDragEvent();
        void component.drop(event);
        expect(projectStateService.isValidDrop).toHaveBeenCalled();
        expect(projectStateService.getDropInsertIndex).toHaveBeenCalled();
        expect(projectStateService.moveElement).toHaveBeenCalled();
        expect(
          dialogGatewayService.openConfirmationDialog
        ).not.toHaveBeenCalled();
      });

      it('should show confirmation dialog when confirmElementMoves is enabled', () => {
        settingsService.getSetting.mockReturnValue(true); // confirmElementMoves enabled
        // Set up the dragged node for the test
        component.draggedNode = mockDto;
        dialogGatewayService.openConfirmationDialog.mockResolvedValue(true);

        const event = createTestDragEvent();
        void component.drop(event);
        expect(projectStateService.isValidDrop).toHaveBeenCalled();
        expect(dialogGatewayService.openConfirmationDialog).toHaveBeenCalled();
      });

      it('should not move element when confirmation is cancelled', () => {
        settingsService.getSetting.mockReturnValue(true); // confirmElementMoves enabled
        // Set up the dragged node for the test
        dialogGatewayService.openConfirmationDialog.mockResolvedValue(false);
        component.draggedNode = mockDto;

        const event = createTestDragEvent();
        void component.drop(event);
        expect(projectStateService.isValidDrop).toHaveBeenCalled();
        expect(dialogGatewayService.openConfirmationDialog).toHaveBeenCalled();
        expect(projectStateService.moveElement).not.toHaveBeenCalled();
      });

      it('should not proceed when drop is invalid', () => {
        projectStateService.isValidDrop.mockReturnValue(false);
        const event = createTestDragEvent();

        // Set up the dragged node for the test
        component.draggedNode = mockDto;
        void component.drop(event);
        expect(projectStateService.isValidDrop).toHaveBeenCalled();
        expect(projectStateService.getDropInsertIndex).not.toHaveBeenCalled();
        expect(projectStateService.moveElement).not.toHaveBeenCalled();
        expect(
          dialogGatewayService.openConfirmationDialog
        ).not.toHaveBeenCalled();
      });

      it('should expand a closed folder when dropping into it', () => {
        settingsService.getSetting.mockReturnValue(false); // confirmElementMoves disabled

        // Create a closed folder
        const closedFolder: ProjectElement = {
          id: 'folder-1',
          name: 'Closed Folder',
          type: ElementType.Folder,
          order: 0,
          level: 0,
          expandable: true,
          expanded: false, // Folder is collapsed
          version: 0,
          metadata: {},
          visible: true,
          parentId: null,
        };

        // Set up the visible elements to include the closed folder
        visibleElementsSignal.set([closedFolder, mockDto]);
        fixture.detectChanges();

        // Set up the dragged node
        component.draggedNode = mockDto;

        // Set the target parent folder to the closed folder
        component.targetParentFolderId.set('folder-1');

        const event = createTestDragEvent();
        void component.drop(event);

        // Verify setExpanded was called to expand the folder
        expect(projectStateService.setExpanded).toHaveBeenCalledWith(
          'folder-1',
          true
        );
      });

      it('should not expand an already open folder when dropping into it', () => {
        settingsService.getSetting.mockReturnValue(false); // confirmElementMoves disabled

        // Create an open folder
        const openFolder: ProjectElement = {
          id: 'folder-1',
          name: 'Open Folder',
          type: ElementType.Folder,
          order: 0,
          level: 0,
          expandable: true,
          expanded: true, // Folder is already expanded
          version: 0,
          metadata: {},
          visible: true,
          parentId: null,
        };

        // Set up the visible elements to include the open folder
        visibleElementsSignal.set([openFolder, mockDto]);
        fixture.detectChanges();

        // Set up the dragged node
        component.draggedNode = mockDto;

        // Set the target parent folder to the open folder
        component.targetParentFolderId.set('folder-1');

        const event = createTestDragEvent();
        void component.drop(event);

        // Verify setExpanded was NOT called since folder is already open
        expect(projectStateService.setExpanded).not.toHaveBeenCalled();
      });
    });

    const createTestNode = (
      id: string,
      level: number,
      order: number = 0
    ): ProjectElement => ({
      id,
      name: `Test Node ${id}`,
      type: ElementType.Folder,
      level,
      expandable: false,
      version: 0,
      metadata: {},
      parentId: null,
      visible: true,
      order,
    });

    beforeEach(() => {
      node = mockDto;
      mockDrag = { data: node } as CdkDrag<ProjectElement>;
      _mockDropList = {
        data: [node],
        getSortedItems: () => [mockDrag],
      } as CdkDropList<ProjectElement[]>;
    });

    it('should handle drag start', () => {
      component.dragStarted(node);
      expect(component.draggedNode).toBe(node);
      expect(component.currentDropLevel).toBe(node.level);
      expect(component.validLevelsArray).toEqual([node.level]);
      // Should reset nodeAboveDropPosition
      expect(component['nodeAboveDropPosition']).toBeNull();
    });

    it('should handle drag end', () => {
      component.draggedNode = node;
      component.targetParentFolderId.set('some-folder-id');
      component['nodeAboveDropPosition'] = node;

      component.dragEnded();

      expect(component.draggedNode).toBeNull();
      expect(component.targetParentFolderId()).toBeNull();
      expect(component['nodeAboveDropPosition']).toBeNull();
    });

    it('should handle sorted event', () => {
      // Set up the dragged node for the test
      component.draggedNode = node;

      const [nodeAbove, nodeBelow] = [
        createTestNode('2', 1, 0),
        createTestNode('3', 2, 1),
      ];

      // Create mock drop list with multiple items so filtering works properly
      const mockDropListWithItems = {
        data: [nodeAbove, node, nodeBelow],
        getSortedItems: () => [
          { data: nodeAbove } as CdkDrag<ProjectElement>,
          { data: node } as CdkDrag<ProjectElement>,
          { data: nodeBelow } as CdkDrag<ProjectElement>,
        ],
      } as CdkDropList<ProjectElement[]>;

      const mockSortEvent = {
        previousIndex: 0,
        currentIndex: 1,
        container: mockDropListWithItems,
        item: {
          data: node,
        } as CdkDrag<ProjectElement>,
      } as unknown as CdkDragSortEvent<ProjectElement[]>;

      // Mock the service to return valid levels based on the nodes
      projectStateService.getValidDropLevels.mockReturnValue({
        levels: [nodeAbove.level, nodeBelow.level],
        defaultLevel: nodeAbove.level,
      });

      component.sorted(mockSortEvent);
      expect(component.validLevelsArray).toEqual([
        nodeAbove.level,
        nodeBelow.level,
      ]);
      // Should store nodeAbove for parent folder calculation
      expect(component['nodeAboveDropPosition']).toBe(nodeAbove);
    });

    describe('Parent Folder Highlighting', () => {
      it('should find parent folder when dropping inside a folder', () => {
        const folder: ProjectElement = {
          ...mockDto,
          id: 'folder-1',
          name: 'Parent Folder',
          expandable: true,
          level: 0,
        };
        const childItem: ProjectElement = {
          ...mockDto,
          id: 'child-1',
          name: 'Child Item',
          expandable: false,
          level: 1,
        };

        visibleElementsSignal.set([folder, childItem]);
        fixture.detectChanges();

        // Simulate dropping inside the folder (level 1, after the folder)
        component['nodeAboveDropPosition'] = folder;
        component.currentDropLevel = 1;
        component['updateParentFolderHighlight']();

        expect(component.targetParentFolderId()).toBe('folder-1');
      });

      it('should return null when dropping at root level', () => {
        const folder: ProjectElement = {
          ...mockDto,
          id: 'folder-1',
          name: 'Folder',
          expandable: true,
          level: 0,
        };

        visibleElementsSignal.set([folder]);
        fixture.detectChanges();

        component['nodeAboveDropPosition'] = folder;
        component.currentDropLevel = 0;
        component['updateParentFolderHighlight']();

        expect(component.targetParentFolderId()).toBeNull();
      });

      it('should return null when nodeAbove is null', () => {
        component['nodeAboveDropPosition'] = null;
        component.currentDropLevel = 1;
        component['updateParentFolderHighlight']();

        expect(component.targetParentFolderId()).toBeNull();
      });

      it('should find ancestor folder when dropping at nested level', () => {
        const rootFolder: ProjectElement = {
          ...mockDto,
          id: 'root-folder',
          name: 'Root Folder',
          expandable: true,
          level: 0,
        };
        const nestedItem: ProjectElement = {
          ...mockDto,
          id: 'nested-item',
          name: 'Nested Item',
          expandable: false,
          level: 1,
        };

        visibleElementsSignal.set([rootFolder, nestedItem]);
        fixture.detectChanges();

        // Dropping after nestedItem at level 1 should find rootFolder
        component['nodeAboveDropPosition'] = nestedItem;
        component.currentDropLevel = 1;
        component['updateParentFolderHighlight']();

        expect(component.targetParentFolderId()).toBe('root-folder');
      });
    });

    it('should handle drag move with valid container dimensions', () => {
      const mockMoveEvent = {
        pointerPosition: { x: 100, y: 0 },
      } as CdkDragMove<ProjectElement>;

      // Mock the getBoundingClientRect to return valid dimensions
      vi.spyOn(
        component.treeContainer.nativeElement,
        'getBoundingClientRect'
      ).mockReturnValue({ left: 50, width: 300 } as DOMRect);

      // Mock the querySelector to return a placeholder element
      const mockPlaceholder = document.createElement('div');
      vi.spyOn(
        component.treeContainer.nativeElement,
        'querySelector'
      ).mockReturnValue(mockPlaceholder);

      // Set up valid levels
      component.validLevelsArray = [0, 1, 2];
      component.levelWidth = 24;

      component.dragMove(mockMoveEvent);

      // The relative position is 100 - 50 = 50px
      // With a level width of 24px, this should be level 2 (50 / 24 = 2.08 -> floor = 2)
      // The closest valid level to 2 is 2
      expect(component.currentDropLevel).toBe(2);
      expect(mockPlaceholder.style.marginLeft).toBe('48px');
    });
  });

  it('should extract project info from URL', async () => {
    const node = mockDto;
    await component.onDelete(node);
    expect(projectStateService.deleteElement).toHaveBeenCalled();
  });

  it('should handle drag move with invalid container dimensions', () => {
    const mockMoveEvent = {
      pointerPosition: { x: 100, y: 0 },
    } as CdkDragMove<ProjectElement>;

    vi.spyOn(
      component.treeContainer.nativeElement,
      'getBoundingClientRect'
    ).mockReturnValue({ left: NaN, width: NaN } as DOMRect);

    component.dragMove(mockMoveEvent);
    expect(component.currentDropLevel).toBe(0);
  });

  it('should handle undefined error state', () => {
    errorSignal.set(undefined);
    fixture.detectChanges();
    expect(component.error()).toBeUndefined();
  });

  it('should toggle expanded state of a node', () => {
    const node = { ...mockDto, id: 'test-id' };
    component.toggleExpanded(node);
    expect(projectStateService.toggleExpanded).toHaveBeenCalledWith('test-id');
  });

  describe('Touch and Click Toggle Handling', () => {
    let node: ProjectElement;
    let mockTouchEvent: TouchEvent;
    let mockClickEvent: MouseEvent;

    beforeEach(() => {
      node = { ...mockDto, id: 'test-touch-id' };
      mockTouchEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as TouchEvent;
      mockClickEvent = {
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;
    });

    afterEach(() => {
      // Clean up any pending timeouts
      component.ngOnDestroy();
    });

    it('should handle touch toggle and prevent click event', () => {
      // Handle touch event
      component.toggleExpandedTouch(node, mockTouchEvent);

      expect(mockTouchEvent.preventDefault).toHaveBeenCalled();
      expect(mockTouchEvent.stopPropagation).toHaveBeenCalled();
      expect(projectStateService.toggleExpanded).toHaveBeenCalledWith(
        'test-touch-id'
      );

      // Try to handle click event immediately after - should be ignored
      component.toggleExpandedClick(node, mockClickEvent);

      expect(mockClickEvent.stopPropagation).toHaveBeenCalled();
      // toggleExpanded should still only have been called once (from touch)
      expect(projectStateService.toggleExpanded).toHaveBeenCalledTimes(1);
    });

    it('should handle click toggle when no recent touch event', () => {
      // Handle click event without prior touch
      component.toggleExpandedClick(node, mockClickEvent);

      expect(mockClickEvent.stopPropagation).toHaveBeenCalled();
      expect(projectStateService.toggleExpanded).toHaveBeenCalledWith(
        'test-touch-id'
      );
    });

    it('should clear touch flag after timeout', () => {
      vi.useFakeTimers();
      // Handle touch event
      component.toggleExpandedTouch(node, mockTouchEvent);

      // Fast-forward time past the timeout
      vi.advanceTimersByTime(300);

      // Now click should work normally
      component.toggleExpandedClick(node, mockClickEvent);

      expect(projectStateService.toggleExpanded).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });

    it('should clear existing timeout when new touch event occurs', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      // First touch event
      component.toggleExpandedTouch(node, mockTouchEvent);

      // Second touch event before timeout
      component.toggleExpandedTouch(node, mockTouchEvent);

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(projectStateService.toggleExpanded).toHaveBeenCalledTimes(2);
    });

    it('should handle touch events for different nodes independently', () => {
      const node2 = { ...mockDto, id: 'test-touch-id-2' };

      // Touch first node
      component.toggleExpandedTouch(node, mockTouchEvent);

      // Click second node should work normally
      component.toggleExpandedClick(node2, mockClickEvent);

      expect(projectStateService.toggleExpanded).toHaveBeenCalledWith(
        'test-touch-id'
      );
      expect(projectStateService.toggleExpanded).toHaveBeenCalledWith(
        'test-touch-id-2'
      );
      expect(projectStateService.toggleExpanded).toHaveBeenCalledTimes(2);
    });
  });

  it('should edit project', () => {
    component.editProject();
    expect(projectStateService.showEditProjectDialog).toHaveBeenCalled();
  });

  it('should open new element dialog when Create button is clicked', () => {
    component.onCreateNewElement();
    expect(projectStateService.showNewElementDialog).toHaveBeenCalled();
  });

  describe('Home Navigation', () => {
    it('should navigate to home when goHome is called', () => {
      component.goHome();
      expect(projectStateService.openSystemTab).toHaveBeenCalledWith('home');
    });

    it('should return true for isHomeSelected when current tab has systemType home', () => {
      openTabsSignal.set([{ systemType: 'media' }, { systemType: 'home' }]);
      selectedTabIndexSignal.set(1);
      expect(component.isHomeSelected()).toBe(true);
    });

    it('should return false for isHomeSelected when current tab has different systemType', () => {
      openTabsSignal.set([{ systemType: 'home' }, { systemType: 'media' }]);
      selectedTabIndexSignal.set(1);
      expect(component.isHomeSelected()).toBe(false);
    });

    it('should return false for isHomeSelected when current tab has no systemType', () => {
      openTabsSignal.set([{ systemType: 'home' }, {}]);
      selectedTabIndexSignal.set(1);
      expect(component.isHomeSelected()).toBe(false);
    });
  });

  describe('Rename Handling', () => {
    it('should handle successful rename', async () => {
      const node = mockDto;
      dialogGatewayService.openRenameDialog.mockResolvedValue('New Name');

      await component.onRename(node);

      expect(dialogGatewayService.openRenameDialog).toHaveBeenCalledWith({
        currentName: node.name,
        title: 'Rename Item',
      });
    });

    it('should handle cancelled rename', async () => {
      const node = mockDto;
      dialogGatewayService.openRenameDialog.mockResolvedValue(null);

      await component.onRename(node);

      expect(dialogGatewayService.openRenameDialog).toHaveBeenCalled();
      // No further action should be taken when rename is cancelled
    });

    it('should use correct title for folder nodes', async () => {
      const folderNode = { ...mockDto, expandable: true };
      await component.onRename(folderNode);

      expect(dialogGatewayService.openRenameDialog).toHaveBeenCalledWith({
        currentName: folderNode.name,
        title: 'Rename Folder',
      });
    });
  });

  describe('Context Menu', () => {
    let regularNode: ProjectElement;
    let fileNode: ProjectElement;

    const createFileNode = (): ProjectElement => ({
      id: '2',
      name: 'Test File',
      type: ElementType.Item,
      order: 0,
      level: 1,
      expandable: false,
      version: 0,
      metadata: {},
      visible: true,
      parentId: null,
    });

    beforeEach(() => {
      regularNode = { ...mockDto };
      fileNode = createFileNode();
      elementsSignal.update(elements => [...elements, fileNode]);
      fixture.detectChanges();
    });

    describe('Basic Menu Operations', () => {
      it('should open and close context menu', () => {
        component.onContextMenuOpen(regularNode);
        expect(component.contextItem).toBe(regularNode);

        component.onContextMenuClose();
        expect(component.contextItem).toBeNull();
      });

      it('should open document through context menu', () => {
        const node = fileNode;
        expect(node.type).toBe('ITEM');

        component.onOpenDocument(node);
        expect(projectStateService.openDocument).toHaveBeenCalledWith({
          ...node,
          expandable: false,
          expanded: undefined,
          level: node.level,
          visible: undefined,
        });
      });
    });
  });
});
