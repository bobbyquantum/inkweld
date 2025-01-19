import { ArrayDataSource } from '@angular/cdk/collections';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragMove,
  CdkDragSortEvent,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project-state.service';
import { ProjectAPIService } from '@worm/index';
import { of } from 'rxjs';

import { projectServiceMock } from '../../../testing/project-api.mock';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { ProjectElement } from './project-element';
import { ProjectTreeComponent } from './project-tree.component';

const ROOT_WRAPPER_ID = 'root-wrapper';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;
  let treeService: jest.Mocked<ProjectStateService>;
  let elementsSignal: WritableSignal<ProjectElement[]>;
  let loadingSignal: WritableSignal<boolean>;
  let savingSignal: WritableSignal<boolean>;
  let errorSignal: WritableSignal<string | undefined>;
  let mockDialogRef: MatDialogRef<unknown, unknown>;

  const mockDto: ProjectElement = {
    id: '1',
    name: 'Test Element',
    type: 'FOLDER',
    position: 0,
    level: 0,
  };

  const createMockDialogRef = () =>
    ({
      afterClosed: jest.fn(),
      close: jest.fn(),
      componentInstance: {},
      _containerInstance: {},
      _ref: {},
      id: 'mock-dialog',
      backdropClick: of(),
      keydownEvents: of(),
      updatePosition: jest.fn(),
      updateSize: jest.fn(),
      addPanelClass: jest.fn(),
      removePanelClass: jest.fn(),
      getState: jest.fn(),
    }) as unknown as MatDialogRef<unknown, unknown>;

  const setupTestBed = async () => {
    // Mock window.location.pathname
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/project/testuser/testproject',
      },
      writable: true,
    });

    // Create writable signals
    elementsSignal = signal<ProjectElement[]>([mockDto]);
    loadingSignal = signal(false);
    savingSignal = signal(false);
    errorSignal = signal<string | undefined>(undefined);

    treeService = {
      elements: elementsSignal,
      isLoading: loadingSignal,
      isSaving: savingSignal,
      error: errorSignal,
      project: signal({ title: 'Test Project' }),
      saveProjectElements: jest.fn().mockResolvedValue(undefined),
      openFile: jest.fn(),
      updateProject: jest.fn(),
    } as unknown as jest.Mocked<ProjectStateService>;

    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent, NoopAnimationsModule],
      providers: [
        { provide: ProjectStateService, useValue: treeService },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        provideHttpClient(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectTreeComponent);
    component = fixture.componentInstance;
    mockDialogRef = createMockDialogRef();
    jest.spyOn(component.dialog, 'open').mockReturnValue(mockDialogRef);
    // fixture.detectChanges();
  };

  beforeEach(async () => {
    await setupTestBed();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with elements from service', () => {
    // Account for root wrapper + 1 element
    expect(component.treeElements()).toHaveLength(2);
    // Root wrapper should be first
    expect(component.treeElements()[0].id).toBe(ROOT_WRAPPER_ID);
    // Original element should be second with increased level
    expect(component.treeElements()[1].type).toBe('FOLDER');
    expect(component.treeElements()[1].level).toBe(1);
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

    it('should update tree when elements change', () => {
      const newElement: ProjectElement = {
        id: '2',
        name: 'New Element',
        type: 'ITEM',
        position: 1,
        level: 0,
      };

      elementsSignal.set([mockDto, newElement]);

      expect(component.treeElements()).toHaveLength(3);
      const lastElement = component.treeElements()[2];
      expect(lastElement.type).toBe('ITEM');
      expect(lastElement.level).toBe(1);
    });
  });

  describe('Tree Manipulation', () => {
    let testNode: ProjectElement;

    beforeEach(() => {
      testNode = component.treeManipulator.getData()[1];
    });

    it('should toggle node expansion', () => {
      const initialState = testNode.expanded;
      component.toggleExpanded(testNode);
      expect(testNode.expanded).toBe(!initialState);
    });

    it('should handle node deletion', async () => {
      await component.onDelete(testNode);

      const treeData = component.treeManipulator.getData();
      expect(treeData).toHaveLength(1);
      expect(treeData[0].id).toBe(ROOT_WRAPPER_ID);
      expect(treeService.saveProjectElements).toHaveBeenCalled();
    });

    it('should handle node renaming', async () => {
      const newName = 'Renamed Element';

      component.startEditing(testNode);
      expect(component.editingNode).toBe(testNode.id);

      await component.finishEditing(testNode, newName);
      expect(component.treeManipulator.getData()[1].name).toBe(newName);
      expect(component.editingNode).toBeUndefined();
      expect(treeService.saveProjectElements).toHaveBeenCalled();
    });

    describe('Node Creation', () => {
      it('should create new item', async () => {
        await component.onNewItem(testNode);

        const treeData = component.treeManipulator.getData();
        const newItem = treeData[2];

        expect(treeData).toHaveLength(3);
        expect(newItem.type).toBe('ITEM');
        expect(newItem.level).toBe(testNode.level + 1);
        expect(newItem.id).toBeUndefined();
        expect(component.editingNode).toBe(undefined);
        expect(treeService.saveProjectElements).toHaveBeenCalled();
      });

      it('should create new folder', async () => {
        await component.onNewFolder(testNode);

        const treeData = component.treeManipulator.getData();
        const newFolder = treeData[2];

        expect(treeData).toHaveLength(3);
        expect(newFolder.type).toBe('FOLDER');
        expect(newFolder.level).toBe(testNode.level + 1);
        expect(newFolder.id).toBeUndefined();
        expect(newFolder.expandable).toBe(true);
        expect(component.editingNode).toBe(undefined);
        expect(treeService.saveProjectElements).toHaveBeenCalled();
      });
    });
  });

  describe('Drag and Drop', () => {
    let mockDrag: CdkDrag<ProjectElement>;
    let mockDropList: CdkDropList<ArrayDataSource<ProjectElement>>;
    let mockEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>>;
    let node: ProjectElement;
    let dataSource: ArrayDataSource<ProjectElement>;

    const createMockDragEvent = () => ({
      previousIndex: 1,
      currentIndex: 1,
      item: mockDrag,
      container: mockDropList,
      previousContainer: mockDropList,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
    });

    const createTestNode = (
      id: string,
      level: number,
      position: number
    ): ProjectElement => ({
      id,
      name: `Test Node ${id}`,
      type: 'FOLDER',
      level,
      position,
    });

    beforeEach(() => {
      dataSource = new ArrayDataSource<ProjectElement>([]);
      node = component.treeManipulator.getData()[1];
      mockDrag = { data: node } as CdkDrag<ProjectElement>;
      mockDropList = {
        data: dataSource,
        getSortedItems: () => [mockDrag],
      } as CdkDropList<ArrayDataSource<ProjectElement>>;
      mockEvent = createMockDragEvent();
    });

    it('should save changes after drag and drop', async () => {
      component.currentDropLevel = 1;
      await component.drop(
        mockEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
      );
      expect(treeService.saveProjectElements).toHaveBeenCalled();
    });

    it('should handle drag start', () => {
      component.dragStarted(node);
      expect(component.draggedNode).toBe(node);
      expect(component.currentDropLevel).toBe(node.level);
      expect(component.validLevelsArray).toEqual([node.level]);
    });

    it('should handle sorted event', () => {
      const mockSortEvent = {
        currentIndex: 1,
        container: mockDropList,
      } as CdkDragSortEvent<ArrayDataSource<ProjectElement>>;

      const [nodeAbove, nodeBelow] = [
        createTestNode('2', 1, 0),
        createTestNode('3', 2, 1),
      ];
      component.treeManipulator.getData().push(nodeAbove, nodeBelow);

      component.sorted(mockSortEvent);
      expect(component.validLevelsArray).toEqual([1, 2]);
    });
  });

  it('should extract project info from URL', async () => {
    // Get the first non-root element
    const node = component.treeManipulator.getData()[1];
    await component.onDelete(node);
    expect(treeService.saveProjectElements).toHaveBeenCalledWith(
      'testuser',
      'testproject',
      expect.any(Array)
    );
  });

  it('should handle drag move with invalid container dimensions', () => {
    const mockMoveEvent = {
      pointerPosition: { x: 100, y: 0 },
    } as CdkDragMove<ArrayDataSource<ProjectElement>>;

    // Mock invalid container dimensions
    jest
      .spyOn(component.treeContainer.nativeElement, 'getBoundingClientRect')
      .mockReturnValue({ left: NaN, width: NaN } as DOMRect);

    component.dragMove(mockMoveEvent);
    expect(component.currentDropLevel).toBe(0); // Should default to minimum level
  });

  it('should handle empty tree state', () => {
    elementsSignal.set([]);
    fixture.detectChanges();

    expect(component.treeElements()).toHaveLength(1); // Just root wrapper
    expect(component.treeManipulator.getData()).toHaveLength(1);
  });

  it('should handle undefined error state', () => {
    errorSignal.set(undefined);
    fixture.detectChanges();
    expect(component.error()).toBeUndefined();
  });

  describe('Project Editing', () => {
    beforeEach(() => {
      mockDialogRef.afterClosed = jest.fn().mockReturnValue(of(null));
    });

    it('should open edit project dialog', () => {
      component.editProject();
      expect(component.dialog.open).toHaveBeenCalledWith(
        EditProjectDialogComponent,
        {
          data: { project: component.projectStateService.project() },
        }
      );
    });

    it('should handle successful dialog result', () => {
      const updatedProject = { title: 'Updated Project' };
      mockDialogRef.afterClosed = jest.fn().mockReturnValue(of(updatedProject));

      component.editProject();
      expect(treeService.updateProject).toHaveBeenCalledWith(updatedProject);
    });

    it('should handle dialog cancellation', () => {
      component.editProject();
      expect(component.error()).toBeUndefined();
      expect(treeService.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('Context Menu', () => {
    let regularNode: ProjectElement;
    let rootNode: ProjectElement;
    let fileNode: ProjectElement;

    const createFileNode = (): ProjectElement => ({
      id: '2',
      name: 'Test File',
      type: 'ITEM',
      position: 1,
      level: 0,
    });

    beforeEach(() => {
      regularNode = component.treeManipulator.getData()[1];
      rootNode = component.treeManipulator.getData()[0];
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

      it('should open file through context menu', () => {
        const node = component.treeManipulator.getData()[2];
        expect(node.type).toBe('ITEM');

        component.onOpenFile(node);

        expect(treeService.openFile).toHaveBeenCalledWith({
          ...node,
          expandable: undefined,
          expanded: undefined,
          level: node.level - 1,
          visible: undefined,
        });
      });
    });

    describe('Root Node Protection', () => {
      beforeEach(() => {
        expect(rootNode.id).toBe(ROOT_WRAPPER_ID);
      });

      it('should prevent root node editing', () => {
        component.startEditing(rootNode);
        expect(component.editingNode).toBeUndefined();
      });

      it('should prevent root node deletion', async () => {
        await component.onDelete(rootNode);
        expect(component.treeManipulator.getData()[0].id).toBe(ROOT_WRAPPER_ID);
      });

      it('should allow context menu but prevent actions on root', async () => {
        component.onContextMenuOpen(rootNode);
        expect(component.contextItem).toBe(rootNode);

        component.onRename(rootNode);
        expect(component.editingNode).toBeUndefined();

        await component.onDelete(rootNode);
        expect(component.treeManipulator.getData()[0].id).toBe(ROOT_WRAPPER_ID);
      });
    });
  });
});
