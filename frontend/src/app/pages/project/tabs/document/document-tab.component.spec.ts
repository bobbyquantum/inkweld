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
import { BehaviorSubject } from 'rxjs';

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
      (projectStateService.selectedTabIndex as any).set(0);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return document ID when selectedTabIndex is 0 (first tab with element)', () => {
      const mockProject = {
        username: 'testuser',
        slug: 'test-project',
        title: 'Test Project',
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
        id: '123',
      } as Project;
      (projectStateService.openTabs as any).set([{ element: { id: 'doc1' } }]);
      (projectStateService.selectedTabIndex as any).set(0);
      (projectStateService.project as any).set(mockProject);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('testuser:test-project:doc1');
    });

    it('should return empty string when tab has no element', () => {
      (projectStateService.openTabs as any).set([{}]);
      (projectStateService.selectedTabIndex as any).set(0);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return empty string when project is undefined', () => {
      (projectStateService.openTabs as any).set([{ element: { id: 'doc1' } }]);
      (projectStateService.selectedTabIndex as any).set(0);
      (projectStateService.project as any).set(undefined);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('');
    });

    it('should return properly formatted document ID when all data is available', () => {
      (projectStateService.openTabs as any).set([{ element: { id: 'doc1' } }]);
      (projectStateService.selectedTabIndex as any).set(0);
      (projectStateService.project as any).set(mockProjectWithInfo);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('testuser:test-project:doc1');
    });

    it('should return correct document ID for second tab', () => {
      (projectStateService.openTabs as any).set([
        { element: { id: 'doc1' } },
        { element: { id: 'doc2' } },
      ]);
      (projectStateService.selectedTabIndex as any).set(1);
      (projectStateService.project as any).set(mockProjectWithInfo);

      const fullId = (component as any).fullDocumentId();
      expect(fullId).toBe('testuser:test-project:doc2');
    });
  });

  describe('useTabsDesktop', () => {
    it('should return settings value for useTabsDesktop', () => {
      const result = (component as any).useTabsDesktop();
      expect(settingsService.getSetting).toHaveBeenCalledWith(
        'useTabsDesktop',
        true
      );
      expect(result).toBe(true);
    });
  });
});
