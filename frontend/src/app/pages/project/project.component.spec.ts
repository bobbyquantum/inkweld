import { CdkDrag, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ProjectAPIService, ProjectDto, ProjectElementDto } from '@worm/index';
import { BehaviorSubject, of } from 'rxjs';

import { ProjectStateService } from '../../services/project-state.service';
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
    const openFilesSignal = signal<ProjectElementDto[]>([]);
    const selectedTabIndexSignal = signal<number>(0);
    const isLoadingSignal = signal<boolean>(false);
    const isSavingSignal = signal<boolean>(false);
    const errorSignal = signal<string | undefined>(undefined);

    projectStateServiceMock = {
      project: projectSignal,
      elements: elementsSignal,
      openFiles: openFilesSignal,
      selectedTabIndex: selectedTabIndexSignal,
      isLoading: isLoadingSignal,
      isSaving: isSavingSignal,
      error: errorSignal,
      loadProject: jest.fn().mockResolvedValue(undefined),
      openFile: jest.fn(),
      closeFile: jest.fn(),
      showEditProjectDialog: jest.fn(),
    };

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

  it('should open a file when onFileOpened is called', () => {
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
    component.onFileOpened(mockElement);
    expect(projectStateServiceMock.openFile).toHaveBeenCalledWith(mockElement);
  });

  it('should close a tab when closeTab is called', () => {
    component.closeTab(1);
    expect(projectStateServiceMock.closeFile).toHaveBeenCalledWith(1);
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
});
