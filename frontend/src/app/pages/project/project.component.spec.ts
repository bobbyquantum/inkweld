import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  const mockProject: ProjectDto = {
    id: '1',
    title: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockElements: ProjectElementDto[] = [
    { id: '1', name: 'Element 1', type: 'ITEM', level: 0, position: 0 },
    { id: '2', name: 'Element 2', type: 'ITEM', level: 0, position: 1 },
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
        .mockReturnValue(of({ matches: false, breakpoints: {} })), // Default to desktop
    } as unknown as jest.Mocked<BreakpointObserver>;

    await TestBed.configureTestingModule({
      imports: [ProjectComponent, NoopAnimationsModule],
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
});
