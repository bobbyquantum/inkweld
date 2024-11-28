import { ArrayDataSource } from '@angular/cdk/collections';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectTreeService } from '@services/project-tree.service';
import { ProjectElementDto } from 'worm-api-client';

import { ProjectElement } from './project-element';
import { ProjectTreeComponent } from './project-tree.component';

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
        pathname: '/testuser/testproject',
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
    expect(component.treeElements()).toHaveLength(1);
    expect(component.treeElements()[0].type).toBe('FOLDER');
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

    expect(component.treeElements()).toHaveLength(2);
    expect(component.treeElements()[1].type).toBe('ITEM');
  });

  it('should toggle node expansion', () => {
    // Get the internal tree element after mapping
    const node = component.treeManipulator.getData()[0];
    component.toggleExpanded(node);
    fixture.detectChanges();
    expect(node.expanded).toBe(true);
  });

  it('should handle node deletion', async () => {
    // Get the internal tree element after mapping
    const node = component.treeManipulator.getData()[0];
    await component.onDelete(node);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()).toHaveLength(0);
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should handle node renaming', async () => {
    // Get the internal tree element after mapping
    const node = component.treeManipulator.getData()[0];
    const newName = 'Renamed Element';
    component.startEditing(node);
    expect(component.editingNode).toBe(node.id);
    await component.finishEditing(node, newName);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()[0].name).toBe(newName);
    expect(component.editingNode).toBeNull();
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should handle adding new items', async () => {
    const node = component.treeManipulator.getData()[0];
    await component.addItem(node);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()).toHaveLength(2);
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should save changes after drag and drop', async () => {
    const dataSource = new ArrayDataSource<ProjectElement>([]);
    const mockDrag = {
      data: component.treeManipulator.getData()[0],
    } as CdkDrag<ProjectElement>;

    const mockDropList = {
      data: dataSource,
      getSortedItems: () => [mockDrag],
    } as CdkDropList<ArrayDataSource<ProjectElement>>;

    // Create a partial mock that satisfies the type requirements
    const mockEvent: Partial<CdkDragDrop<ArrayDataSource<ProjectElement>>> = {
      previousIndex: 0,
      currentIndex: 0,
      item: mockDrag,
      container: mockDropList,
      previousContainer: mockDropList,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
    };

    await component.drop(
      mockEvent as CdkDragDrop<ArrayDataSource<ProjectElement>>
    );
    expect(treeService.saveProjectElements).toHaveBeenCalled();
  });

  it('should extract project info from URL', async () => {
    const node = component.treeManipulator.getData()[0];
    await component.onDelete(node);
    expect(treeService.saveProjectElements).toHaveBeenCalledWith(
      'testuser',
      'testproject',
      expect.any(Array)
    );
  });
});
