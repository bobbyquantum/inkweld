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

  const mockDto: ProjectElement = {
    id: '1',
    name: 'Test Element',
    type: 'FOLDER',
    position: 0,
    level: 0,
  };

  beforeEach(async () => {
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
    fixture.detectChanges();
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

  it('should show loading state', () => {
    loadingSignal.set(true);
    fixture.detectChanges();
    expect(component.isLoading()).toBe(true);
  });

  it('should show saving state', () => {
    savingSignal.set(true);
    fixture.detectChanges();
    expect(component.isSaving()).toBe(true);
  });

  it('should show error state', () => {
    const errorMessage = 'Test error';
    errorSignal.set(errorMessage);
    fixture.detectChanges();

    const error = component.error();
    expect(typeof error).toBe('string');
    expect(error).toBe(errorMessage);
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
    fixture.detectChanges();

    // Account for root wrapper + 2 elements
    expect(component.treeElements()).toHaveLength(3);
    // Check second element (index 1) since root wrapper is first
    expect(component.treeElements()[2].type).toBe('ITEM');
    expect(component.treeElements()[2].level).toBe(1);
  });

  it('should toggle node expansion', () => {
    // Get the first non-root element
    const node = component.treeManipulator.getData()[1];
    const initialState = node.expanded;
    component.toggleExpanded(node);
    fixture.detectChanges();
    expect(node.expanded).toBe(!initialState);
  });

  it('should handle node deletion', async () => {
    // Get the first non-root element
    const node = component.treeManipulator.getData()[1];
    await component.onDelete(node);
    fixture.detectChanges();
    // Should only have root wrapper left
    expect(component.treeManipulator.getData()).toHaveLength(1);
    expect(component.treeManipulator.getData()[0].id).toBe(ROOT_WRAPPER_ID);
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should handle node renaming', async () => {
    // Get the first non-root element
    const node = component.treeManipulator.getData()[1];
    const newName = 'Renamed Element';
    component.startEditing(node);
    expect(component.editingNode).toBe(node.id);
    await component.finishEditing(node, newName);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()[1].name).toBe(newName);
    expect(component.editingNode).toBeUndefined();
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should handle creating new item from context menu', async () => {
    const parentNode = component.treeManipulator.getData()[1];
    await component.onNewItem(parentNode);
    fixture.detectChanges();

    // Should have root wrapper + original element + new item
    expect(component.treeManipulator.getData()).toHaveLength(3);
    const newItem = component.treeManipulator.getData()[2];
    expect(newItem.type).toBe('ITEM');
    expect(newItem.level).toBe(parentNode.level + 1);
    expect(newItem.id).toBeUndefined(); // Empty ID for new items
    expect(component.editingNode).toBe(undefined);
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should handle creating new folder from context menu', async () => {
    const parentNode = component.treeManipulator.getData()[1];
    await component.onNewFolder(parentNode);
    fixture.detectChanges();

    // Should have root wrapper + original element + new folder
    expect(component.treeManipulator.getData()).toHaveLength(3);
    const newFolder = component.treeManipulator.getData()[2];
    expect(newFolder.type).toBe('FOLDER');
    expect(newFolder.level).toBe(parentNode.level + 1);
    expect(newFolder.id).toBeUndefined(); // Empty ID for new folders
    expect(newFolder.expandable).toBe(true);
    expect(component.editingNode).toBe(undefined);
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  describe('Drag and Drop', () => {
    let mockDrag: CdkDrag<ProjectElement>;
    let mockDropList: CdkDropList<ArrayDataSource<ProjectElement>>;
    let mockEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>>;
    let node: ProjectElement;

    beforeEach(() => {
      const dataSource = new ArrayDataSource<ProjectElement>([]);
      node = component.treeManipulator.getData()[1];
      mockDrag = {
        data: node,
      } as CdkDrag<ProjectElement>;

      mockDropList = {
        data: dataSource,
        getSortedItems: () => [mockDrag],
      } as CdkDropList<ArrayDataSource<ProjectElement>>;

      mockEvent = {
        previousIndex: 1,
        currentIndex: 1,
        item: mockDrag,
        container: mockDropList,
        previousContainer: mockDropList,
        isPointerOverContainer: true,
        distance: { x: 0, y: 0 },
      };
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

      // Add additional nodes for testing
      const nodeAbove: ProjectElement = {
        id: '2',
        name: 'Node Above',
        type: 'FOLDER',
        level: 1,
        position: 0,
      };
      const nodeBelow: ProjectElement = {
        id: '3',
        name: 'Node Below',
        type: 'FOLDER',
        level: 2,
        position: 1,
      };
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
    it('should open edit project dialog', () => {
      const dialogSpy = jest.spyOn(component.dialog, 'open');
      component.editProject();
      expect(dialogSpy).toHaveBeenCalledWith(EditProjectDialogComponent, {
        data: { project: component.projectStateService.project() },
      });
    });

    it('should handle dialog result', () => {
      treeService.updateProject = jest.fn();
      const updateSpy = jest.spyOn(treeService, 'updateProject');
      const mockDialogRef = {
        afterClosed: jest
          .fn()
          .mockReturnValue(of({ title: 'Updated Project' })),
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
      } as unknown as MatDialogRef<unknown, unknown>;

      jest.spyOn(component.dialog, 'open').mockReturnValue(mockDialogRef);

      component.editProject();
      expect(updateSpy).toHaveBeenCalledWith({ title: 'Updated Project' });
    });

    it('should handle dialog errors', () => {
      const mockDialogRef = {
        afterClosed: jest.fn().mockReturnValue(of(null)),
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
      } as unknown as MatDialogRef<unknown, unknown>;

      jest.spyOn(component.dialog, 'open').mockReturnValue(mockDialogRef);

      component.editProject();
      expect(component.error()).toBeUndefined();
    });
  });

  describe('Context Menu', () => {
    let node: ProjectElement;

    beforeEach(() => {
      node = component.treeManipulator.getData()[1];
    });

    it('should open and close context menu', () => {
      component.onContextMenuOpen(node);
      expect(component.contextItem).toBe(node);

      component.onContextMenuClose();
      expect(component.contextItem).toBeNull();
    });

    it('should prevent root wrapper modification', async () => {
      const rootNode = component.treeManipulator.getData()[0];
      expect(rootNode.id).toBe(ROOT_WRAPPER_ID);

      // Should not allow editing root
      component.startEditing(rootNode);
      expect(component.editingNode).toBeUndefined();

      // Should not allow deleting root
      await component.onDelete(rootNode);
      expect(component.treeManipulator.getData()[0].id).toBe(ROOT_WRAPPER_ID);

      // Should allow context menu on root but prevent actions
      component.onContextMenuOpen(rootNode);
      expect(component.contextItem).toBe(rootNode);
      component.onRename(rootNode);
      expect(component.editingNode).toBeUndefined();
      await component.onDelete(rootNode);
      expect(component.treeManipulator.getData()[0].id).toBe(ROOT_WRAPPER_ID);
    });

    it('should open file through context menu', () => {
      // Add a file item to the tree
      const fileDto: ProjectElement = {
        id: '2',
        name: 'Test File',
        type: 'ITEM',
        position: 1,
        level: 0,
      };
      elementsSignal.update(elements => [...elements, fileDto]);
      fixture.detectChanges();

      // Get the file node (should be at index 2 after root wrapper and folder)
      const fileNode = component.treeManipulator.getData()[2];
      expect(fileNode.type).toBe('ITEM');

      // Open the file
      component.onOpenFile(fileNode);

      // Verify service was called with correct DTO
      expect(treeService.openFile).toHaveBeenCalledWith({
        id: fileNode.id,
        name: fileNode.name,
        type: fileNode.type,
        level: fileNode.level - 1, // Should be decremented
        position: fileNode.position,
      });
    });
  });
});
