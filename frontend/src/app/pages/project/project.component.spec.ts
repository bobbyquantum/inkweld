import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ProjectAPIService,
  ProjectDto,
  ProjectElementDto,
} from '@inkweld/index';
import { SplitGutterInteractionEvent } from 'angular-split';
import { BehaviorSubject, of } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { DocumentService } from '../../services/document.service';
import { ProjectImportExportService } from '../../services/project-import-export.service';
import {
  AppTab,
  ProjectStateService,
} from '../../services/project-state.service';
import { RecentFilesService } from '../../services/recent-files.service';
import { SettingsService } from '../../services/settings.service';
import { ProjectComponent } from './project.component';

// Create mock components for Angular Split
// ESLint disabled for mock component selectors
/* eslint-disable @angular-eslint/component-selector */
@Component({
  selector: 'as-split',
  template: '<ng-content></ng-content>',
})
class MockSplitComponent {
  @Input() direction: string = '';
  @Input() gutterSize: number = 0;
  @Input() unit: string = '';
  @Input() useTransition: boolean = false;
}

@Component({
  selector: 'as-split-area',
  template: '<ng-content></ng-content>',
})
class MockSplitAreaComponent {
  @Input() size: number = 0;
  @Input() minSize: number = 0;
  @Input() maxSize: number = 0;
}

// Mock module for Angular Split - Removed as components are imported directly

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectServiceMock: jest.Mocked<ProjectAPIService>;
  let projectStateServiceMock: Partial<ProjectStateService>;
  let snackBarMock: jest.Mocked<MatSnackBar>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routeParams: BehaviorSubject<{ username: string; slug: string }>;
  let breakpointObserverMock: Partial<BreakpointObserver>;
  let mockDialogRef: MatDialogRef<unknown>;
  let routerMock: jest.Mocked<Router>;
  let recentFilesServiceMock: jest.Mocked<RecentFilesService>;
  let documentServiceMock: jest.Mocked<DocumentService>;
  let dialogGatewayServiceMock: jest.Mocked<DialogGatewayService>;
  let titleServiceMock: jest.Mocked<Title>;
  let importExportServiceMock: jest.Mocked<ProjectImportExportService>;
  let settingsServiceMock: Partial<SettingsService>;

  const mockElements: ProjectElementDto[] = [
    {
      id: '1',
      name: 'Element 1',
      type: 'ITEM',
      level: 0,
      position: 0,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: '2',
      name: 'Element 2',
      type: 'ITEM',
      level: 0,
      position: 1,
      version: 1,
      expandable: false,
      metadata: {},
    },
    {
      id: '3',
      name: 'Folder Element',
      type: 'FOLDER',
      level: 0,
      position: 2,
      version: 1,
      expandable: true,
      metadata: { viewMode: 'grid' },
    },
  ];

  beforeEach(async () => {
    // Mock global localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn().mockImplementation(key => {
          if (key === 'splitSize') return '25';
          return null;
        }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });

    // Mock ProjectAPIService
    projectServiceMock = {
      projectControllerGetProjectByUsernameAndSlug: jest.fn(),
    } as unknown as jest.Mocked<ProjectAPIService>;

    // Mock HttpClient
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    // Create ProjectStateService mock with all necessary signals and methods
    projectStateServiceMock = {
      project: signal<ProjectDto | undefined>(undefined),
      elements: signal<ProjectElementDto[]>([]),
      visibleElements: signal<ProjectElementDto[]>([]),
      openDocuments: signal<ProjectElementDto[]>([]),
      openTabs: signal<AppTab[]>([]),
      selectedTabIndex: signal<number>(0),
      isLoading: signal<boolean>(false),
      isSaving: signal<boolean>(false),
      error: signal<string | undefined>(undefined),
      loadProject: jest.fn().mockResolvedValue(undefined),
      openDocument: jest.fn(),
      closeDocument: jest.fn(),
      closeTab: jest.fn(),
      openSystemTab: jest.fn(),
      showNewElementDialog: jest.fn(),
      showEditProjectDialog: jest.fn(),
      publishProject: jest.fn(),
    };

    // Mock Router
    routerMock = {
      navigate: jest.fn().mockResolvedValue(true),
      url: '/testuser/test-project/document/123',
    } as unknown as jest.Mocked<Router>;

    // Mock RecentFilesService
    recentFilesServiceMock = {
      addRecentFile: jest.fn(),
      getRecentFiles: jest.fn().mockReturnValue([]),
      getRecentFilesForProject: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<RecentFilesService>;

    // Mock DocumentService
    documentServiceMock = {
      getSyncStatus: jest.fn().mockReturnValue(of(DocumentSyncState.Synced)),
      disconnect: jest.fn(),
      hasUnsyncedChanges: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<DocumentService>;

    // Mock DialogGatewayService
    dialogGatewayServiceMock = {
      openConfirmationDialog: jest.fn().mockResolvedValue(true),
      openEditProjectDialog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DialogGatewayService>;

    // Mock Title service
    titleServiceMock = {
      setTitle: jest.fn(),
    } as unknown as jest.Mocked<Title>;

    // Mock SettingsService
    settingsServiceMock = {
      getSetting: jest.fn().mockImplementation(key => {
        if (key === 'zenModeFullscreen') return true;
        return null;
      }),
    };

    // Mock ProjectImportExportService
    importExportServiceMock = {
      exportProjectZip: jest.fn().mockResolvedValue(undefined),
      importProjectZip: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProjectImportExportService>;

    // Mock MatSnackBar
    snackBarMock = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    // Create route params subject
    routeParams = new BehaviorSubject({
      username: 'testuser',
      slug: 'test-project',
    });

    // Mock BreakpointObserver
    const breakpointSubject = new BehaviorSubject<{ matches: boolean }>({
      matches: false,
    });
    breakpointObserverMock = {
      observe: jest.fn().mockReturnValue(breakpointSubject),
    };

    // Mock MatDialog
    mockDialogRef = {
      afterClosed: jest.fn().mockReturnValue(of(null)),
      close: jest.fn(),
    } as unknown as MatDialogRef<unknown>;

    const dialogMock = {
      open: jest.fn().mockReturnValue(mockDialogRef),
    };

    await TestBed.configureTestingModule({
      imports: [ProjectComponent, MockSplitComponent, MockSplitAreaComponent],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: ProjectAPIService, useValue: projectServiceMock },
        { provide: ProjectStateService, useValue: projectStateServiceMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: BreakpointObserver, useValue: breakpointObserverMock },
        { provide: Router, useValue: routerMock },
        { provide: RecentFilesService, useValue: recentFilesServiceMock },
        { provide: DocumentService, useValue: documentServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayServiceMock },
        { provide: Title, useValue: titleServiceMock },
        { provide: SettingsService, useValue: settingsServiceMock },
        {
          provide: ProjectImportExportService,
          useValue: importExportServiceMock,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            params: routeParams.asObservable(),
            snapshot: {
              paramMap: {
                get: jest.fn().mockReturnValue(null),
              },
              url: [],
            },
          },
        },
        { provide: MatDialog, useValue: dialogMock },
      ],
    })
      .overrideComponent(ProjectComponent, {
        // Override the component's template with a simpler version for tests
        set: {
          template: `<div>Test Component</div>`,
          providers: [],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;

    // Mock the sidenav
    component.sidenav = {
      open: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      toggle: jest.fn().mockResolvedValue(undefined),
      mode: 'side',
    } as unknown as MatSidenav;

    // Mock fileInput
    component.fileInput = {
      nativeElement: document.createElement('input'),
    } as ElementRef<HTMLInputElement>;

    fixture.detectChanges();
  });

  afterEach(() => {
    routeParams.complete();
    jest.clearAllMocks();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('Split sizing', () => {
    it('should update split size on drag end', () => {
      const mockEvent = {
        gutterNum: 1,
        sizes: [30, 70],
      } as SplitGutterInteractionEvent;

      jest.spyOn(component, 'isMobile').mockReturnValue(false);
      const localStorageSpy = jest.spyOn(localStorage, 'setItem');

      component.onSplitDragEnd(mockEvent);

      expect(component['splitSize']).toBe(30);
      expect(localStorageSpy).toHaveBeenCalledWith('splitSize', '30');
    });

    it('should not update split size when in mobile mode', () => {
      const mockEvent = {
        gutterNum: 1,
        sizes: [30, 70],
      } as SplitGutterInteractionEvent;

      jest.spyOn(component, 'isMobile').mockReturnValue(true);
      const localStorageSpy = jest.spyOn(localStorage, 'setItem');

      component.onSplitDragEnd(mockEvent);

      expect(localStorageSpy).not.toHaveBeenCalled();
    });

    it('should get correct gutter size based on mobile state', () => {
      jest.spyOn(component, 'isMobile').mockReturnValue(false);
      expect(component.getGutterSize()).toBe(8);

      jest.spyOn(component, 'isMobile').mockReturnValue(true);
      expect(component.getGutterSize()).toBe(0);
    });

    describe('Zen mode', () => {
      it('should determine if zen mode can be enabled', () => {
        // Mock required properties - Use non-null assertion
        (projectStateServiceMock.selectedTabIndex as any).set(1);
        (projectStateServiceMock.openTabs as any).set([
          {
            id: 'doc1',
            type: 'document',
            name: 'Test Doc',
            element: mockElements[0],
          },
        ]);

        // Should be enabled for document tabs
        expect(component.canEnableZenMode()).toBe(true);

        // Should not be enabled for home tab
        (projectStateServiceMock.selectedTabIndex as any).set(0);
        expect(component.canEnableZenMode()).toBe(false);

        // Should not be enabled for system tabs
        (projectStateServiceMock.selectedTabIndex as any).set(1);
        (projectStateServiceMock.openTabs as any).set([
          {
            id: 'system-files',
            type: 'system',
            name: 'Files',
            systemType: 'project-files',
          },
        ]);
        expect(component.canEnableZenMode()).toBe(false);
      });

      it('should get current document ID for zen mode', () => {
        // Setting up a scenario when we are on a document tab
        (projectStateServiceMock.selectedTabIndex as any).set(1);
        (projectStateServiceMock.project as any).set({
          username: 'testuser',
          slug: 'test-project',
          title: 'Test Project',
          id: 'test123',
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        } as ProjectDto);
        (projectStateServiceMock.openTabs as any).set([
          {
            id: 'doc1',
            type: 'document',
            name: 'Test Doc',
            element: mockElements[0],
          },
        ]);

        // Should return the full document ID
        expect(component.getCurrentDocumentId()).toBe(
          'testuser:test-project:doc1'
        );

        // Should return null for system tabs
        (projectStateServiceMock.openTabs as any).set([
          {
            id: 'system-files',
            type: 'system',
            name: 'Files',
            systemType: 'project-files',
          },
        ]);
        expect(component.getCurrentDocumentId()).toBeNull();
      });
    });
  });

  describe('Component methods', () => {
    it('should open document', () => {
      const element = mockElements[0];
      component.onDocumentOpened(element);
      expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(
        element
      );
    });

    it('should close sidenav on mobile when document opened', () => {
      const element = mockElements[0];
      jest.spyOn(component, 'isMobile').mockReturnValue(true);
      // Ensure sidenav mock is assigned specifically for this test,
      // as ViewChild won't work with the overridden template.
      component.sidenav = {
        close: jest.fn().mockResolvedValue(undefined),
        // Add other methods/properties if needed by other parts of the test/component
      } as unknown as MatSidenav;

      component.onDocumentOpened(element);

      expect(component.sidenav.close).toHaveBeenCalled();
    });

    it('should close tab', () => {
      component.closeTab(1);
      expect(projectStateServiceMock.closeTab).toHaveBeenCalledWith(0); // index - 1
    });

    it('should exit project', () => {
      component.exitProject();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});
