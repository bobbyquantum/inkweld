import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInnerType } from '@inkweld/index';
import { vi } from 'vitest';

import { ProjectElement } from '../../models/project-element';
import { ProjectStateService } from '../../services/project-state.service';
import { FolderElementEditorComponent } from './folder-element-editor.component';

// Mock component for TreeNodeIcon
@Component({
  selector: 'app-tree-node-icon',
  template: '<div class="mock-icon"></div>',
})
class MockTreeNodeIconComponent {
  isExpandable: boolean = false;
  isExpanded: boolean = false;
  type: string = '';
}

describe('FolderElementEditorComponent', () => {
  let component: FolderElementEditorComponent;
  let fixture: ComponentFixture<FolderElementEditorComponent>;
  let mockProjectStateService: any;

  const mockElements: ProjectElement[] = [
    {
      id: 'folder1',
      name: 'Test Folder',
      type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder,
      level: 0,
      order: 0,
      parentId: null,
      expandable: true,
      expanded: true,
      visible: true,
      version: 1,
      metadata: { viewMode: 'grid' },
    },
    {
      id: 'item1',
      name: 'Test Item 1',
      type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
      level: 1,
      order: 1,
      parentId: 'folder1',
      expandable: false,
      expanded: false,
      visible: true,
      version: 1,
      metadata: {},
    },
    {
      id: 'item2',
      name: 'Test Item 2',
      type: GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item,
      level: 1,
      order: 2,
      parentId: 'folder1',
      expandable: false,
      expanded: false,
      visible: true,
      version: 1,
      metadata: {},
    },
  ];

  beforeEach(async () => {
    mockProjectStateService = {
      elements: vi.fn().mockReturnValue(mockElements),
      isLoading: signal(false),
      error: signal(undefined),
      openDocument: vi.fn(),
      updateElements: vi.fn(),
      showNewElementDialog: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        NoopAnimationsModule,
        FolderElementEditorComponent,
        MockTreeNodeIconComponent,
      ],
      declarations: [],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectStateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderElementEditorComponent);
    component = fixture.componentInstance;
    component.elementId = 'folder1';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load child elements on initialization', () => {
    expect(component.childElements().length).toBe(2);
    expect(component.childElements()[0].id).toBe('item1');
    expect(component.childElements()[1].id).toBe('item2');
  });

  it('should load view mode from metadata', () => {
    expect(component.viewMode()).toBe('grid');
  });

  it('should change view mode and save to metadata', () => {
    // Spy on the private method
    vi.spyOn<any, any>(component, 'saveViewModeToMetadata');

    component.setViewMode('list');

    expect(component.viewMode()).toBe('list');
    expect(component['saveViewModeToMetadata']).toHaveBeenCalledWith('list');
  });

  it('should open an element when clicked', () => {
    const element = mockElements[1]; // Test Item 1
    component.openElement(element);

    expect(mockProjectStateService.openDocument).toHaveBeenCalledWith(element);
  });

  it('should handle drop events for reordering', () => {
    const dropEvent = {
      previousIndex: 0,
      currentIndex: 1,
      container: {
        data: component.childElements(),
      },
    } as unknown as CdkDragDrop<ProjectElement[]>;

    component.onDrop(dropEvent);

    expect(mockProjectStateService.updateElements).toHaveBeenCalled();
  });

  it('should create a new element', () => {
    component.createNewElement();

    expect(mockProjectStateService.showNewElementDialog).toHaveBeenCalled();
  });

  it('should display grid view when viewMode is grid', () => {
    component.setViewMode('grid');
    fixture.detectChanges();

    const gridContainer = fixture.debugElement.query(By.css('.grid-container'));
    expect(gridContainer).toBeTruthy();

    const listContainer = fixture.debugElement.query(By.css('.list-container'));
    expect(listContainer).toBeFalsy();
  });

  it('should display list view when viewMode is list', () => {
    component.setViewMode('list');
    fixture.detectChanges();

    const gridContainer = fixture.debugElement.query(By.css('.grid-container'));
    expect(gridContainer).toBeFalsy();

    const listContainer = fixture.debugElement.query(By.css('.list-container'));
    expect(listContainer).toBeTruthy();
  });

  it('should show empty state when there are no child elements', () => {
    // Override the childElements signal
    component.childElements.set([]);
    fixture.detectChanges();

    const emptyFolder = fixture.debugElement.query(By.css('.empty-folder'));
    expect(emptyFolder).toBeTruthy();
  });
});
