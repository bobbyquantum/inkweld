import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Project } from '@inkweld/index';
import { SettingsService } from '@services/core/settings.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
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
  @Input() tabsDisabled: boolean = false;

  ngOnInit(): void {
    console.log('Mock document editor initialized');
  }

  ngOnDestroy(): void {
    console.log('Mock document editor destroyed');
  }
}

describe('DocumentTabComponent', () => {
  let component: DocumentTabComponent;
  let fixture: ComponentFixture<DocumentTabComponent>;
  let documentService: Partial<DocumentService>;
  let projectStateService: Partial<ProjectStateService>;
  let settingsService: Partial<SettingsService>;
  let route: Partial<ActivatedRoute>;

  // const mockProject = {
  //   username: 'testuser',
  //   slug: 'test-project',
  //   title: 'Test Project',
  //   createdDate: new Date().toISOString(),
  //   updatedDate: new Date().toISOString(),
  //   id: '123',
  // } as Project;
  const mockProject = {} as Project;
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
      initializeSyncStatus: vi.fn(),
      disconnect: vi.fn(),
      getSyncStatus: vi.fn().mockReturnValue(of({})),
    };

    projectStateService = {
      project: signal(mockProject),
      openTabs: signal([]),
      selectedTabIndex: signal(0),
    };

    settingsService = {
      getSetting: vi.fn().mockReturnValue(true),
    };

    route = {
      paramMap: paramsSubject.asObservable(),
    };

    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule,
        MatIconModule,
        DocumentTabComponent,
        MockDocumentElementEditorComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentService, useValue: documentService },
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: SettingsService, useValue: settingsService },
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

  // afterEach(() => {
  //   paramsSubject.complete();
  // });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('fullDocumentId computed signal', () => {
    const mockProjectWithInfo = {
      username: 'testuser',
      slug: 'test-project',
      title: 'Test Project',
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      id: '123',
    } as Project;

    it('should return empty string when no tabs are open', () => {
      (projectStateService.openTabs as any).set([]);
      (projectStateService.selectedTabIndex as any).set(1);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return empty string when selectedTabIndex is 0 (home)', () => {
      (projectStateService.openTabs as any).set([
        { element: { id: 'doc1' } },
      ]);
      (projectStateService.selectedTabIndex as any).set(0);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return empty string when tab has no element', () => {
      (projectStateService.openTabs as any).set([{}]);
      (projectStateService.selectedTabIndex as any).set(1);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return empty string when project is undefined', () => {
      (projectStateService.openTabs as any).set([
        { element: { id: 'doc1' } },
      ]);
      (projectStateService.selectedTabIndex as any).set(1);
      (projectStateService.project as any).set(undefined);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return properly formatted document ID when all data is available', () => {
      (projectStateService.openTabs as any).set([
        { element: { id: 'doc1' } },
      ]);
      (projectStateService.selectedTabIndex as any).set(1);
      (projectStateService.project as any).set(mockProjectWithInfo);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('testuser:test-project:doc1');
    });

    it('should return correct document ID for second tab', () => {
      (projectStateService.openTabs as any).set([
        { element: { id: 'doc1' } },
        { element: { id: 'doc2' } },
      ]);
      (projectStateService.selectedTabIndex as any).set(2);
      (projectStateService.project as any).set(mockProjectWithInfo);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('testuser:test-project:doc2');
    });
  });

  describe('useTabsDesktop', () => {
    it('should return settings value for useTabsDesktop', () => {
      const result = (component as any).useTabsDesktop();
      expect(settingsService.getSetting).toHaveBeenCalledWith('useTabsDesktop', true);
      expect(result).toBe(true);
    });
  });

  // it('should initialize with document ID from route params', () => {
  //   expect(component['documentId']).toBe('doc1');
  // });

  // it('should render the document element editor with the correct ID', async () => {
  //   const documentEditor = fixture.nativeElement.querySelector(
  //     'app-document-element-editor'
  //   );
  //   expect(documentEditor).toBeTruthy();
  //   // Manually trigger the route param subscription with the correct value
  //   paramsSubject.next(
  //     convertToParamMap({
  //       tabId: 'doc1',
  //     })
  //   );

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Check that the component has the full document ID set correctly
  //   expect((component as any).fullDocumentId).toBe(
  //     'testuser:test-project:doc1'
  //   );
  // });

  // it('should update documentId when route params change', async () => {
  //   // Change the route param using convertToParamMap
  //   paramsSubject.next(convertToParamMap({ tabId: 'doc2' }));
  //   fixture.detectChanges();

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Document ID should be updated
  //   expect(component['documentId']).toBe('doc2');
  //   expect((component as any).fullDocumentId).toBe(
  //     'testuser:test-project:doc2'
  //   );

  //   // Initialization should be called for new document
  //   expect(documentService.initializeSyncStatus).toHaveBeenCalledWith(
  //     'testuser:test-project:doc2'
  //   );
  // });

  // it('should call initializeSyncStatus with correct ID on init', async () => {
  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));

  //   expect(documentService.initializeSyncStatus).toHaveBeenCalledWith(
  //     'testuser:test-project:doc1'
  //   );
  // });

  // it('should calculate fullDocumentId correctly when ID has colons', async () => {
  //   // Change the route param to an ID that already contains project info
  //   paramsSubject.next(
  //     convertToParamMap({ tabId: 'otheruser:other-project:doc3' })
  //   );
  //   fixture.detectChanges();

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Should use the full ID as is, without prepending project info
  //   expect((component as any).fullDocumentId).toBe(
  //     'otheruser:other-project:doc3'
  //   );
  // });

  // it('should calculate fullDocumentId using project info when ID has no colons', async () => {
  //   // Change the route param to a simple ID
  //   paramsSubject.next(convertToParamMap({ tabId: 'simple-id' }));
  //   fixture.detectChanges();

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Should build the full ID using project info
  //   expect((component as any).fullDocumentId).toBe(
  //     'testuser:test-project:simple-id'
  //   );
  // });

  // it('should handle missing document ID gracefully', async () => {
  //   // Change the route param to an empty ID
  //   paramsSubject.next(convertToParamMap({ tabId: '' }));
  //   fixture.detectChanges();

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Should have an empty ID
  //   expect(component['documentId']).toBe('');
  //   expect((component as any).fullDocumentId).toBe('');
  // });

  // it('should handle missing project gracefully', async () => {
  //   // Set project to undefined
  //   (projectStateService.project as any).set(undefined);
  //   fixture.detectChanges();

  //   // Reset route params to trigger recalculation
  //   paramsSubject.next(convertToParamMap({ tabId: 'doc1' }));
  //   fixture.detectChanges();

  //   // Wait for Promise to resolve
  //   await new Promise(r => setTimeout(r, 10));
  //   fixture.detectChanges();

  //   // Should fall back to just the document ID
  //   expect((component as any).fullDocumentId).toBe('doc1');
  // });
});
