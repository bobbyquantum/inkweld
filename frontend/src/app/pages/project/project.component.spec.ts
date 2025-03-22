import { CdkDrag, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { ElementRef, signal } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSidenav } from '@angular/material/sidenav';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ProjectAPIService,
  ProjectDto,
  ProjectElementDto,
} from '@inkweld/index';
import { BehaviorSubject, of } from 'rxjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { DocumentService } from '../../services/document.service';
import { ProjectImportExportService } from '../../services/project-import-export.service';
import { ProjectStateService } from '../../services/project-state.service';
import { RecentFilesService } from '../../services/recent-files.service';
import { ProjectComponent } from './project.component';

// Mock IndexedDB
const mockIndexedDB = {
  open: jest.fn().mockImplementation(() => {
    return {
      onupgradeneeded: jest.fn(),
      onsuccess: jest.fn(),
      onerror: jest.fn(),
      result: {
        createObjectStore: jest.fn(),
        transaction: {
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn(),
            put: jest.fn(),
          }),
        },
      },
    };
  }),
  deleteDatabase: jest.fn(),
};

// Mock global indexedDB
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});

describe('ProjectComponent', () => {
  let component: ProjectComponent;
  let fixture: ComponentFixture<ProjectComponent>;
  let projectServiceMock: jest.Mocked<ProjectAPIService>;
  let projectStateServiceMock: Partial<ProjectStateService>;
  let snackBarMock: jest.Mocked<MatSnackBar>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routeParams: BehaviorSubject<{ username: string; slug: string }>;
  let breakpointObserverMock: jest.Mocked<BreakpointObserver>;
  let mockDialogRef: MatDialogRef<unknown>;
  let routerMock: jest.Mocked<Router>;
  let recentFilesServiceMock: jest.Mocked<RecentFilesService>;
  let documentServiceMock: jest.Mocked<DocumentService>;
  let dialogGatewayServiceMock: jest.Mocked<DialogGatewayService>;
  let titleServiceMock: jest.Mocked<Title>;
  let importExportServiceMock: jest.Mocked<ProjectImportExportService>;

  const mockProject: ProjectDto = {
    id: '1',
    title: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

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
    // Mock global indexedDB
    Object.defineProperty(window, 'indexedDB', {
      value: mockIndexedDB,
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

    // Mock signals in ProjectStateService
    const projectSignal = signal<ProjectDto>({} as ProjectDto);
    const elementsSignal = signal<ProjectElementDto[]>([]);
    const visibleElementsSignal = signal<ProjectElementDto[]>([]);

    const openDocumentsSignal = signal<ProjectElementDto[]>([]);
    const selectedTabIndexSignal = signal<number>(0);
    const isLoadingSignal = signal<boolean>(false);
    const isSavingSignal = signal<boolean>(false);
    const errorSignal = signal<string | undefined>(undefined);

    projectStateServiceMock = {
      project: projectSignal,
      elements: elementsSignal,
      visibleElements: visibleElementsSignal,
      openDocuments: openDocumentsSignal,
      selectedTabIndex: selectedTabIndexSignal,
      isLoading: isLoadingSignal,
      isSaving: isSavingSignal,
      error: errorSignal,
      loadProject: jest.fn().mockResolvedValue(undefined),
      openDocument: jest.fn(),
      closeDocument: jest.fn(),
      showEditProjectDialog: jest.fn(),
    };

    // Mock Router
    routerMock = {
      navigate: jest.fn().mockResolvedValue(true),
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
    breakpointObserverMock = {
      observe: jest
        .fn()
        .mockReturnValue(of({ matches: false, breakpoints: {} })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    // Mock MatDialog
    mockDialogRef = {
      afterClosed: jest.fn().mockReturnValue(of(null)),
      close: jest.fn(),
    } as unknown as MatDialogRef<unknown>;

    const dialogMock = {
      open: jest.fn().mockReturnValue(mockDialogRef),
    };

    // Create dialog spy
    jest.spyOn(dialogMock, 'open');

    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule, DragDropModule],
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
        {
          provide: ProjectImportExportService,
          useValue: importExportServiceMock,
        },
        {
          provide: ActivatedRoute,
          useValue: { params: routeParams.asObservable() },
        },
        { provide: MatDialog, useValue: dialogMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    routeParams.complete();
    jest.clearAllMocks();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should load project and elements on init', async () => {
    // Mock the loadProject method to set the project signal
    (projectStateServiceMock.loadProject as jest.Mock).mockImplementation(
      () => {
        projectStateServiceMock.project?.set(mockProject);
        projectStateServiceMock.elements?.set(mockElements);
        return Promise.resolve();
      }
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(projectStateServiceMock.loadProject).toHaveBeenCalledWith(
      'testuser',
      'test-project'
    );
    expect(projectStateServiceMock.project?.()).toEqual(mockProject);
  });

  it('should handle route params changes', async () => {
    (projectStateServiceMock.loadProject as jest.Mock).mockResolvedValue(
      undefined
    );
    fixture.detectChanges();

    routeParams.next({ username: 'newuser', slug: 'new-project' });
    await fixture.whenStable();

    expect(projectStateServiceMock.loadProject).toHaveBeenCalledWith(
      'newuser',
      'new-project'
    );
  });

  it('should open a document when onDocumentOpened is called', () => {
    const mockElement: ProjectElementDto = {
      id: '3',
      name: 'New Element',
      type: 'ITEM',
      level: 0,
      position: 0,
      version: 1,
      expandable: false,
      metadata: {},
    };
    component.onDocumentOpened(mockElement);
    expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(
      mockElement
    );
  });

  it('should display folder-element-editor when a folder is opened', () => {
    const folderElement = mockElements.find(e => e.type === 'FOLDER');
    if (!folderElement) {
      fail('Folder element not found in mock data');
      return;
    }

    // Set up the component to show a folder element
    projectStateServiceMock.openDocuments?.set([folderElement]);
    projectStateServiceMock.selectedTabIndex?.set(1);
    fixture.detectChanges();

    // Check if the folder-element-editor component is rendered
    const compiled = fixture.nativeElement;
    const folderEditor = compiled.querySelector('app-folder-element-editor');
    expect(folderEditor).toBeTruthy();
  });

  it('should close a tab when closeTab is called', () => {
    component.closeTab(1);
    expect(projectStateServiceMock.closeDocument).toHaveBeenCalledWith(1);
  });

  it('should display loading state based on isLoading signal', () => {
    projectStateServiceMock.isLoading?.set(true);
    fixture.detectChanges();
    const nativeElement = fixture.nativeElement as HTMLElement;
    const loadingIndicator = nativeElement.querySelector('.loading-indicator');
    expect(loadingIndicator).toBeTruthy();
    projectStateServiceMock.isLoading?.set(false);
    fixture.detectChanges();
    expect(nativeElement.querySelector('.loading-indicator')).toBeNull();
  });

  it('should handle errors by displaying a snack bar message', () => {
    const errorMessage = 'An error occurred';
    projectStateServiceMock.error?.set(errorMessage);
    fixture.detectChanges();
    expect(snackBarMock.open).toHaveBeenCalledWith(errorMessage, 'Close', {
      duration: 5000,
    });
  });

  it('should set isMobile to true when breakpoint observer matches mobile breakpoints', () => {
    breakpointObserverMock.observe.mockReturnValue(
      of({ matches: true, breakpoints: { [Breakpoints.XSmall]: true } })
    );
    fixture.detectChanges();
    expect(component.isMobile()).toBe(true);
  });

  it('should set isMobile to false when breakpoint observer does not match mobile breakpoints', () => {
    breakpointObserverMock.observe.mockReturnValue(
      of({ matches: false, breakpoints: {} })
    );
    fixture.detectChanges();
    expect(component.isMobile()).toBe(false);
  });

  describe('Sidenav resizing', () => {
    beforeEach(() => {
      // Mock localStorage
      Storage.prototype.getItem = jest.fn().mockImplementation(() => '200');
      Storage.prototype.setItem = jest.fn();

      // Create mock sidenav element
      const sidenavEl = document.createElement('div');
      sidenavEl.className = 'sidenav-content';
      sidenavEl.style.width = '200px';
      Object.defineProperty(sidenavEl, 'offsetWidth', {
        configurable: true,
        value: 200,
      });
      document.body.appendChild(sidenavEl);
      jest
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          if (this.classList.contains('sidenav-content')) {
            // Return the element's style width (or a default if not set)
            return parseInt(this.style.width, 10) || 200;
          }
          return 0;
        });
    });

    afterEach(() => {
      document.body.innerHTML = '';
    });

    const createMockDrag = (x: number) =>
      ({
        source: {
          getFreeDragPosition: () => ({ x, y: 0 }),
          element: document.createElement('div'),
          dropContainer: null,
          _dragRef: { reset: jest.fn() },
        } as unknown as CdkDrag,
        distance: { x, y: 0 },
        dropPoint: { x, y: 0 },
        event: new MouseEvent('mouseup'),
      }) as CdkDragEnd;

    it('should update sidenav width on drag end', () => {
      component.onDragStart();
      component.onDragEnd(createMockDrag(50));

      const sidenavEl = document.querySelector<HTMLElement>('.sidenav-content');
      const width = parseInt(sidenavEl?.style.width || '0', 10);
      expect(width).toBe(250); // 200px + 50px
    });

    it('should respect min and max width constraints', () => {
      // Test minimum width
      component.onDragStart();
      component.onDragEnd(createMockDrag(-500));
      const minWidth = parseInt(
        document.querySelector<HTMLElement>('.sidenav-content')?.style.width ||
          '0',
        10
      );
      expect(minWidth).toBe(150);

      // Test maximum width
      component.onDragStart();
      component.onDragEnd(createMockDrag(1000));
      const maxWidth = parseInt(
        document.querySelector<HTMLElement>('.sidenav-content')?.style.width ||
          '0',
        10
      );
      expect(maxWidth).toBe(600);
    });

    it('should save width to localStorage on drag end', () => {
      component.onDragStart();
      component.onDragEnd(createMockDrag(50));
      expect(localStorage.setItem).toHaveBeenCalledWith('sidenavWidth', '250');
    });
  });

  describe('Project Editing', () => {
    beforeEach(() => {
      mockDialogRef.afterClosed = jest.fn().mockReturnValue(of(null));
    });

    it('should show edit project dialog through service', () => {
      projectStateServiceMock.showEditProjectDialog?.();
      expect(projectStateServiceMock.showEditProjectDialog).toHaveBeenCalled();
    });

    it('should handle successful dialog result', fakeAsync(() => {
      const updatedProject = { title: 'Updated Project' };
      mockDialogRef.afterClosed = jest.fn().mockReturnValue(of(updatedProject));

      projectStateServiceMock.showEditProjectDialog?.();
      tick();

      expect(projectStateServiceMock.showEditProjectDialog).toHaveBeenCalled();
    }));

    it('should handle dialog cancellation', () => {
      projectStateServiceMock.showEditProjectDialog?.();
      expect(projectStateServiceMock.error?.()).toBeUndefined();
      expect(projectStateServiceMock.showEditProjectDialog).toHaveBeenCalled();
    });
  });

  // New tests to increase code coverage
  describe('Navigation and guard methods', () => {
    it('should navigate to home when exitProject is called', () => {
      component.exitProject();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should allow deactivation when no unsaved changes exist', async () => {
      documentServiceMock.getSyncStatus.mockReturnValue(
        of(DocumentSyncState.Synced)
      );
      const result = await component.canDeactivate();
      expect(result).toBe(true);
      expect(
        dialogGatewayServiceMock.openConfirmationDialog
      ).not.toHaveBeenCalled();
    });

    it('should prompt for confirmation when unsaved changes exist', async () => {
      // Set up unsaved changes
      documentServiceMock.getSyncStatus.mockReturnValue(
        of(DocumentSyncState.Offline)
      );
      projectStateServiceMock.openDocuments?.set([mockElements[0]]);
      fixture.detectChanges();

      // Wait for the effect to run
      await fixture.whenStable();

      // Reset mock to test actual call in canDeactivate
      dialogGatewayServiceMock.openConfirmationDialog.mockClear();
      dialogGatewayServiceMock.openConfirmationDialog.mockResolvedValue(false);

      const result = await component.canDeactivate();

      expect(
        dialogGatewayServiceMock.openConfirmationDialog
      ).toHaveBeenCalledWith({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to leave?',
        confirmText: 'Leave',
        cancelText: 'Stay',
      });
      expect(result).toBe(false);
    });

    it('should handle beforeunload event correctly', () => {
      // Setup for no unsaved changes
      documentServiceMock.getSyncStatus.mockReturnValue(
        of(DocumentSyncState.Synced)
      );
      const eventNoChanges = new Event('beforeunload') as BeforeUnloadEvent;
      eventNoChanges.preventDefault = jest.fn();

      const resultNoChanges = component.onBeforeUnload(eventNoChanges);
      expect(resultNoChanges).toBe(true);
      expect(eventNoChanges.preventDefault).not.toHaveBeenCalled();

      // Setup for unsaved changes
      documentServiceMock.getSyncStatus.mockReturnValue(
        of(DocumentSyncState.Offline)
      );
      projectStateServiceMock.openDocuments?.set([mockElements[0]]);
      fixture.detectChanges();

      const eventWithChanges = new Event('beforeunload') as BeforeUnloadEvent;
      eventWithChanges.preventDefault = jest.fn();
      Object.defineProperty(eventWithChanges, 'returnValue', {
        writable: true,
        value: '',
      });

      const resultWithChanges = component.onBeforeUnload(eventWithChanges);
      expect(resultWithChanges).toBe('');
      expect(eventWithChanges.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Sidenav interactions', () => {
    it('should toggle sidenav when toggleSidenav is called', async () => {
      // Mock the sidenav
      component.sidenav = {
        toggle: jest.fn().mockResolvedValue(undefined),
      } as unknown as MatSidenav;

      await component.toggleSidenav();
      expect(component.sidenav.toggle).toHaveBeenCalled();
    });
  });

  describe('Recent documents functionality', () => {
    it('should open a document when clicked in recent files', () => {
      const documentId = '1';
      projectStateServiceMock.elements?.set(mockElements);

      component.onRecentDocumentClick(documentId);

      expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(
        mockElements[0]
      );
    });

    it('should open a document when Enter key is pressed in recent files', () => {
      const documentId = '1';
      projectStateServiceMock.elements?.set(mockElements);

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onRecentDocumentKeydown(event, documentId);

      expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(
        mockElements[0]
      );
    });

    it('should open a document when Space key is pressed in recent files', () => {
      const documentId = '1';
      projectStateServiceMock.elements?.set(mockElements);

      const event = new KeyboardEvent('keydown', { key: ' ' });
      component.onRecentDocumentKeydown(event, documentId);

      expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(
        mockElements[0]
      );
    });

    it('should not open a document when other keys are pressed in recent files', () => {
      const documentId = '1';
      projectStateServiceMock.elements?.set(mockElements);

      const event = new KeyboardEvent('keydown', { key: 'a' });
      component.onRecentDocumentKeydown(event, documentId);

      expect(projectStateServiceMock.openDocument).not.toHaveBeenCalled();
    });
  });

  describe('Import and Export functionality', () => {
    it('should trigger project export when onExportClick is called', () => {
      projectStateServiceMock.project?.set(mockProject);

      component.onExportClick();

      expect(importExportServiceMock.exportProjectZip).toHaveBeenCalled();
    });

    it('should trigger file input click when onImportClick is called', () => {
      // Mock the file input element
      component.fileInput = {
        nativeElement: { click: jest.fn() },
      } as unknown as ElementRef<HTMLInputElement>;

      component.onImportClick();

      expect(component.fileInput.nativeElement.click).toHaveBeenCalled();
    });

    it('should import project when file is selected', () => {
      projectStateServiceMock.project?.set(mockProject);

      const file = new File(['dummy content'], 'project.zip', {
        type: 'application/zip',
      });
      const event = { target: { files: [file] } } as unknown as Event;

      component.onFileSelected(event);

      expect(importExportServiceMock.importProjectZip).toHaveBeenCalledWith(
        file
      );
    });

    it('should not import if no file is selected', () => {
      projectStateServiceMock.project?.set(mockProject);

      const event = { target: { files: [] } } as unknown as Event;

      component.onFileSelected(event);

      expect(importExportServiceMock.importProjectZip).not.toHaveBeenCalled();
    });
  });

  describe('Project editing', () => {
    it('should open edit project dialog through dialog gateway', () => {
      projectStateServiceMock.project?.set(mockProject);

      component.openEditDialog();

      expect(
        dialogGatewayServiceMock.openEditProjectDialog
      ).toHaveBeenCalledWith(mockProject);
    });
  });

  describe('Title setting', () => {
    it('should update document title when project changes', () => {
      projectStateServiceMock.project?.set(mockProject);
      fixture.detectChanges();

      expect(titleServiceMock.setTitle).toHaveBeenCalledWith('Test Project');
    });
  });

  // Existing code sections can remain as they are
});
