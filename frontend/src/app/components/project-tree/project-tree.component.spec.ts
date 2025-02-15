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
import { fakeAsync, tick } from '@angular/core/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project-state.service';
import { ProjectAPIService } from '@worm/index';
import { of } from 'rxjs';

import { projectServiceMock } from '../../../testing/project-api.mock';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { ProjectElement } from '../../models/project-element';
import { ProjectTreeComponent } from './project-tree.component';

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
    level: 1, // Updated to reflect no root node wrapping
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
    // Account for 1 element
    expect(component.treeElements()).toHaveLength(1);
    // Original element should be first
    expect(component.treeElements()[0].type).toBe('FOLDER');
    expect(component.treeElements()[0].level).toBe(1); // Updated to reflect no root node wrapping
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
        level: 1, // Updated to reflect no root node wrapping
      };

      elementsSignal.set([mockDto, newElement]);

      expect(component.treeElements()).toHaveLength(2);
      const lastElement = component.treeElements()[1];
      expect(lastElement.type).toBe('ITEM');
      expect(lastElement.level).toBe(1); // Updated to reflect no root node wrapping
    });
  });

  describe('Tree Manipulation', () => {
    let testNode: ProjectElement;

    beforeEach(() => {
      const data = component.treeManipulator.getData();
      if (data.length < 2) {
        component.treeManipulator.addNode('ITEM', data[0] || mockDto); // Ensure at least 2 nodes
      }
      testNode = component.treeManipulator.getData()[1];
    });

    describe('Node Creation', () => {
      // Modify to focus on component state and service calls rather than tree structure
      it('should create new item and start editing', async () => {
        await component.onNewItem(testNode);
        expect(component.editingNode).toBeDefined();
        expect(treeService.saveProjectElements).toHaveBeenCalled();
      });

      it('should create new folder and start editing', async () => {
        await component.onNewFolder(testNode);
        expect(component.editingNode).toBeDefined();
        expect(treeService.saveProjectElements).toHaveBeenCalled();
      });
    });
  });

  describe('Drag and Drop', () => {
    let mockDrag: CdkDrag<ProjectElement>;
    let mockDropList: CdkDropList<ArrayDataSource<ProjectElement>>;
    let node: ProjectElement;
    let dataSource: ArrayDataSource<ProjectElement>;
    const createTestDragEvent = (
      invalid = false
    ): CdkDragDrop<ArrayDataSource<ProjectElement>> => ({
      previousIndex: 0,
      currentIndex: 1,
      item: {
        data: invalid
          ? { ...mockDto, id: undefined, position: undefined }
          : mockDto,
      } as CdkDrag<ProjectElement>,
      container: {
        data: new ArrayDataSource([mockDto]),
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ArrayDataSource<ProjectElement>>,
      previousContainer: {
        data: new ArrayDataSource([mockDto]),
        getSortedItems: () => [{ data: mockDto } as CdkDrag<ProjectElement>],
      } as CdkDropList<ArrayDataSource<ProjectElement>>,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      event: new MouseEvent('mouseup'),
      dropPoint: { x: 0, y: 0 },
    });

    it('should handle valid drops', fakeAsync(() => {
      const event = createTestDragEvent();
      void component.drop(event);
      tick();
      expect(treeService.saveProjectElements).toHaveBeenCalled();
    }));
    it('should handle valid drops', fakeAsync(() => {
      const event = createTestDragEvent();
      void component.drop(event);
      tick();
      expect(treeService.saveProjectElements).toHaveBeenCalled();
    }));

    it('should prevent invalid drops', fakeAsync(() => {
      const event = createTestDragEvent(true);
      component.currentDropLevel = 3;
      void component.drop(event);
      tick();
      expect(treeService.saveProjectElements).not.toHaveBeenCalled();
    }));

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
      const data = component.treeManipulator.getData();
      if (data.length < 2) {
        component.treeManipulator.addNode('ITEM', data[0] || mockDto); // Ensure at least 2 nodes
      }
      node = component.treeManipulator.getData()[1];
      mockDrag = { data: node } as CdkDrag<ProjectElement>;
      mockDropList = {
        data: dataSource,
        getSortedItems: () => [mockDrag],
      } as CdkDropList<ArrayDataSource<ProjectElement>>;
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
    // Get the first element
    const node = component.treeManipulator.getData()[0];
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

    expect(component.treeElements()).toHaveLength(0); // Empty tree with no elements
    expect(component.treeManipulator.getData()).toHaveLength(0);
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
    let fileNode: ProjectElement;

    const createFileNode = (): ProjectElement => ({
      id: '2',
      name: 'Test File',
      type: 'ITEM',
      position: 0,
      level: 1, // Updated to reflect no root node wrapping
    });

    beforeEach(() => {
      regularNode = component.treeManipulator.getData()[0];
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
        const node = component.treeManipulator.getData()[1];
        expect(node.type).toBe('ITEM');

        component.onOpenFile(node);

        expect(treeService.openFile).toHaveBeenCalledWith({
          ...node,
          expandable: undefined,
          expanded: undefined,
          level: node.level - 1, // Decrement level since component increments it for tree display
          visible: undefined,
        });
      });
    });
  });
});
