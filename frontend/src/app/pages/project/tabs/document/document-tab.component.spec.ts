import { signal } from '@angular/core';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { BehaviorSubject, of } from 'rxjs';

import { DocumentTabComponent } from './document-tab.component';

// Mock DocumentElementEditorComponent (with standalone: true)
@Component({
  selector: 'app-document-element-editor',
  template: '<div>Mock Document Editor</div>',
  standalone: true,
})
class MockDocumentElementEditorComponent implements OnInit, OnDestroy {
  @Input() documentId: string = '';

  // Add mock lifecycle hooks to prevent calls to actual implementation
  ngOnInit(): void {
    // Mock implementation for testing
    console.log('Mock document editor initialized');
  }

  ngOnDestroy(): void {
    // Mock implementation for testing
    console.log('Mock document editor destroyed');
  }
}

describe('DocumentTabComponent', () => {
  let component: DocumentTabComponent;
  let fixture: ComponentFixture<DocumentTabComponent>;
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
    // Add other required fields from ProjectDto
    id: '123',
  };

  // Mock route params
  let paramsSubject: BehaviorSubject<any>;

  beforeEach(async () => {
    // Set up mocked route params using convertToParamMap
    paramsSubject = new BehaviorSubject(
      convertToParamMap({
        tabId: 'doc1',
      })
    );

    // Set up mocked services
    documentService = {
      initializeSyncStatus: jest.fn(),
      disconnect: jest.fn(), // Add mock for disconnect method
      getSyncStatus: jest.fn().mockReturnValue(of({})),
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
        MatIconModule,
        DocumentTabComponent,
        NoopAnimationsModule,
        MockDocumentElementEditorComponent,
      ],
      providers: [
        { provide: DocumentService, useValue: documentService },
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: ActivatedRoute, useValue: route },
      ],
    })
      .overrideComponent(DocumentTabComponent, {
        set: {
          imports: [MockDocumentElementEditorComponent, MatIconModule],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DocumentTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    paramsSubject.complete();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with document ID from route params', () => {
    expect(component['documentId']).toBe('doc1');
  });

  it('should render the document element editor with the correct ID', () => {
    const documentEditor = fixture.nativeElement.querySelector(
      'app-document-element-editor'
    );
    expect(documentEditor).toBeTruthy();
    // Manually trigger the route param subscription with the correct value
    paramsSubject.next(
      convertToParamMap({
        tabId: 'doc1',
      })
    );

    // Detect changes after triggering the param update
    fixture.detectChanges();
    fixture.detectChanges();

    // Check that the component has the full document ID set correctly
    expect((component as any).fullDocumentId).toBe(
      'testuser:test-project:doc1'
    );
  });

  it('should update documentId when route params change', () => {
    // Change the route param using convertToParamMap
    paramsSubject.next(convertToParamMap({ tabId: 'doc2' }));
    fixture.detectChanges();

    // Document ID should be updated
    expect(component['documentId']).toBe('doc2');
    expect((component as any).fullDocumentId).toBe(
      'testuser:test-project:doc2'
    );

    // Initialization should be called for new document
    expect(documentService.initializeSyncStatus).toHaveBeenCalledWith(
      'testuser:test-project:doc2'
    );
  });

  it('should call initializeSyncStatus with correct ID on init', () => {
    expect(documentService.initializeSyncStatus).toHaveBeenCalledWith(
      'testuser:test-project:doc1'
    );
  });

  it('should calculate fullDocumentId correctly when ID has colons', () => {
    // Change the route param to an ID that already contains project info
    paramsSubject.next(
      convertToParamMap({ tabId: 'otheruser:other-project:doc3' })
    );
    fixture.detectChanges();

    // Should use the full ID as is, without prepending project info
    expect((component as any).fullDocumentId).toBe(
      'otheruser:other-project:doc3'
    );
  });

  it('should calculate fullDocumentId using project info when ID has no colons', () => {
    // Change the route param to a simple ID
    paramsSubject.next(convertToParamMap({ tabId: 'simple-id' }));
    fixture.detectChanges();

    // Should build the full ID using project info
    expect((component as any).fullDocumentId).toBe(
      'testuser:test-project:simple-id'
    );
  });

  it('should handle missing document ID gracefully', () => {
    // Change the route param to an empty ID
    paramsSubject.next(convertToParamMap({ tabId: '' }));
    fixture.detectChanges();

    // Should have an empty ID
    expect(component['documentId']).toBe('');
    expect((component as any).fullDocumentId).toBe('');
  });

  it('should handle missing project gracefully', () => {
    // Set project to undefined
    (projectStateService.project as any).set(undefined);
    fixture.detectChanges();

    // Reset route params to trigger recalculation
    paramsSubject.next(convertToParamMap({ tabId: 'doc1' }));
    fixture.detectChanges();

    // Should fall back to just the document ID
    expect((component as any).fullDocumentId).toBe('doc1');
  });
});
