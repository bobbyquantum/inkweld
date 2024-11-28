import { ArrayDataSource } from '@angular/cdk/collections';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectTreeService } from '@services/project-tree.service';
import { ProjectElementDto } from 'worm-api-client';

import { ProjectElement } from './project-element';
import { ProjectTreeComponent } from './project-tree.component';

const ROOT_WRAPPER_ID = 'root-wrapper';

describe('ProjectTreeComponent', () => {
  let component: ProjectTreeComponent;
  let fixture: ComponentFixture<ProjectTreeComponent>;
  let treeService: jest.Mocked<ProjectTreeService>;
  let elementsSignal: WritableSignal<ProjectElementDto[]>;
  let loadingSignal: WritableSignal<boolean>;
  let savingSignal: WritableSignal<boolean>;
  let errorSignal: WritableSignal<string | undefined>;

  const mockDto: ProjectElementDto = {
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
    elementsSignal = signal<ProjectElementDto[]>([mockDto]);
    loadingSignal = signal(false);
    savingSignal = signal(false);
    errorSignal = signal<string | undefined>(undefined);

    treeService = {
      elements: elementsSignal,
      isLoading: loadingSignal,
      isSaving: savingSignal,
      error: errorSignal,
      saveProjectElements: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectTreeService>;

    await TestBed.configureTestingModule({
      imports: [ProjectTreeComponent, NoopAnimationsModule],
      providers: [{ provide: ProjectTreeService, useValue: treeService }],
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
    expect(component.error()).toBe(errorMessage);
  });

  it('should update tree when elements change', () => {
    const newElement: ProjectElementDto = {
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

  it('should save changes after drag and drop', async () => {
    const dataSource = new ArrayDataSource<ProjectElement>([]);
    // Use first non-root element
    const node = component.treeManipulator.getData()[1];
    const mockDrag = {
      data: node,
    } as CdkDrag<ProjectElement>;

    const mockDropList = {
      data: dataSource,
      getSortedItems: () => [mockDrag],
    } as CdkDropList<ArrayDataSource<ProjectElement>>;

    // Create a partial mock that satisfies the type requirements
    const mockEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>> = {
      previousIndex: 1, // Account for root wrapper
      currentIndex: 1,
      item: mockDrag,
      container: mockDropList,
      previousContainer: mockDropList,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
    };

    // Set valid drop level to ensure drop is processed
    component.currentDropLevel = 1;

    await component.drop(
      mockEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
    );

    expect(treeService.saveProjectElements).toHaveBeenCalled();
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
});
