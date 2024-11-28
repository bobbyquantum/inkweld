import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectTreeService } from '@services/project-tree.service';
import { ProjectElementDto } from 'worm-api-client';

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

  it('should handle node deletion', () => {
    // Get the internal tree element after mapping
    const node = component.treeManipulator.getData()[0];
    component.onDelete(node);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()).toHaveLength(0);
  });

  it('should handle node renaming', () => {
    // Get the internal tree element after mapping
    const node = component.treeManipulator.getData()[0];
    const newName = 'Renamed Element';
    component.startEditing(node);
    expect(component.editingNode).toBe(node.id);
    component.finishEditing(node, newName);
    fixture.detectChanges();
    expect(component.treeManipulator.getData()[0].name).toBe(newName);
    expect(component.editingNode).toBeNull();
  });
});
