import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Project } from '@inkweld/index';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';

import { FolderTabComponent } from './folder-tab.component';

// Mock FolderElementEditorComponent
@Component({
  selector: 'app-folder-element-editor',
  template: '<div>Mock Folder Editor</div>',
  standalone: true,
})
class MockFolderElementEditorComponent implements OnInit, OnDestroy {
  @Input() elementId: string = '';

  ngOnInit(): void {
    // Mock implementation for testing
    console.log('Mock folder editor initialized');
  }

  ngOnDestroy(): void {
    // Mock implementation for testing
    console.log('Mock folder editor destroyed');
  }
}

describe('FolderTabComponent', () => {
  let component: FolderTabComponent;
  let fixture: ComponentFixture<FolderTabComponent>;
  let documentService: Partial<DocumentService>;
  let projectStateService: Partial<ProjectStateService>;
  let route: Partial<ActivatedRoute>;

  // Mock project data
  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    id: '123',
  } as Project;

  // Mock route params
  let paramsSubject: BehaviorSubject<any>;

  beforeEach(async () => {
    // Set up mocked route params using convertToParamMap
    paramsSubject = new BehaviorSubject(
      convertToParamMap({
        tabId: 'folder1',
      })
    );

    // Set up mocked services
    documentService = {
      disconnect: vi.fn(),
      getSyncStatus: vi.fn().mockReturnValue(of({})),
    };

    projectStateService = {
      project: signal(mockProject),
    };

    route = {
      paramMap: paramsSubject.asObservable(),
    };

    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule,
        FolderTabComponent,
        MockFolderElementEditorComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentService, useValue: documentService },
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: ActivatedRoute, useValue: route },
      ],
    })
      .overrideComponent(FolderTabComponent, {
        set: {
          imports: [MockFolderElementEditorComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(FolderTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    paramsSubject.complete();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with folder ID from route params', () => {
    expect(component['elementId']).toBe('folder1');
  });

  it('should render the folder element editor with the correct ID', () => {
    const folderEditor = fixture.nativeElement.querySelector(
      'app-folder-element-editor'
    );
    expect(folderEditor).toBeTruthy();

    // Manually trigger the route param subscription with the correct value
    paramsSubject.next(
      convertToParamMap({
        tabId: 'folder1',
      })
    );

    // Detect changes after triggering the param update
    fixture.detectChanges();

    // Check that the component has the full folder ID set correctly
    expect((component as any).fullElementId).toBe(
      'testuser:test-project:folder1'
    );
  });

  it('should update elementId when route params change', async () => {
    // Change the route param
    paramsSubject.next(convertToParamMap({ tabId: 'folder2' }));
    fixture.detectChanges();

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    fixture.detectChanges();

    // Element ID should be updated
    expect(component['elementId']).toBe('folder2');
    expect((component as any).fullElementId).toBe(
      'testuser:test-project:folder2'
    );
  });

  it('should calculate fullElementId correctly when ID has colons', async () => {
    // Change the route param to an ID that already contains project info
    paramsSubject.next(
      convertToParamMap({ tabId: 'otheruser:other-project:folder3' })
    );
    fixture.detectChanges();

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    fixture.detectChanges();

    // Should use the full ID as is, without prepending project info
    expect((component as any).fullElementId).toBe(
      'otheruser:other-project:folder3'
    );
  });

  it('should calculate fullElementId using project info when ID has no colons', async () => {
    // Change the route param to a simple ID
    paramsSubject.next(convertToParamMap({ tabId: 'simple-folder-id' }));
    fixture.detectChanges();

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    fixture.detectChanges();

    // Should build the full ID using project info
    expect((component as any).fullElementId).toBe(
      'testuser:test-project:simple-folder-id'
    );
  });

  it('should handle missing element ID gracefully', async () => {
    // Change the route param to an empty ID
    paramsSubject.next(convertToParamMap({ tabId: '' }));
    fixture.detectChanges();

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    fixture.detectChanges();

    // Should have an empty ID
    expect(component['elementId']).toBe('');
    expect((component as any).fullElementId).toBe('');
  });

  it('should handle missing project gracefully', async () => {
    // Set project to undefined
    (projectStateService.project as any).set(undefined);
    paramsSubject.next(convertToParamMap({ tabId: 'folder1' }));
    fixture.detectChanges();

    // Wait for setTimeout to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    fixture.detectChanges();

    // Should fall back to just the element ID
    expect((component as any).fullElementId).toBe('folder1');
  });

  it('should provide the element ID via getElementId method', () => {
    expect(component.getElementId()).toBe('folder1');
  });

  it('should clean up subscription on destroy', () => {
    const mockSubscription = {
      unsubscribe: vi.fn(),
    };
    component['paramSubscription'] = mockSubscription as any;

    component.ngOnDestroy();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('should handle destroy when no subscription exists', () => {
    component['paramSubscription'] = null;

    // Should not throw an error
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
