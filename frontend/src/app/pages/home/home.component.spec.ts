import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import {
  ProjectAPIService,
  ProjectDto,
  UserAPIService,
  UserDto,
} from '@inkweld/index';
import { ThemeService } from '@themes/theme.service';
import { of, throwError } from 'rxjs';
import { retry } from 'rxjs/operators';

import { HomeComponent } from './home.component';

jest.mock('@themes/theme.service');
jest.mock('@angular/cdk/layout');
jest.mock('rxjs/operators', () => {
  // Return the actual implementation for all operators except retry
  const actual = jest.requireActual('rxjs/operators');
  return {
    ...actual,
    retry: jest.fn().mockImplementation(count => actual.retry(count)),
  };
});

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: jest.Mocked<ThemeService>;
  let userService: jest.Mocked<UserAPIService>;
  let projectService: jest.Mocked<ProjectAPIService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;
  let httpClient: jest.Mocked<HttpClient>;

  beforeEach(async () => {
    themeService = {
      update: jest.fn(),
      isDarkMode: jest.fn(),
    } as unknown as jest.Mocked<ThemeService>;

    breakpointObserver = {
      observe: jest
        .fn()
        .mockReturnValue(of({ matches: true, breakpoints: {} })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    httpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    userService = {
      userControllerGetMe: jest.fn().mockReturnValue(of({} as UserDto)),
    } as unknown as jest.Mocked<UserAPIService>;

    projectService = {
      projectControllerGetAllProjects: jest
        .fn()
        .mockReturnValue(of([] as ProjectDto[])),
      projectControllerCreateProject: jest.fn(),
    } as unknown as jest.Mocked<ProjectAPIService>;

    await TestBed.configureTestingModule({
      imports: [HomeComponent, NoopAnimationsModule],
      providers: [
        provideRouter([
          { path: '', component: HomeComponent },
          { path: ':id', component: HomeComponent },
        ]),
        provideLocationMocks(),
        { provide: ThemeService, useValue: themeService },
        { provide: UserAPIService, useValue: userService },
        { provide: ProjectAPIService, useValue: projectService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: HttpClient, useValue: httpClient },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: '123' })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch all projects on init', () => {
    component.ngOnInit();
    expect(projectService.projectControllerGetAllProjects).toHaveBeenCalled();
  });

  it('should setup breakpoint observer on init', () => {
    component.ngOnInit();
    expect(breakpointObserver.observe).toHaveBeenCalledWith([
      Breakpoints.XSmall,
      Breakpoints.Small,
    ]);
  });

  it('should select a project', () => {
    const project = {
      id: '123',
      name: 'Test Project',
    } as unknown as ProjectDto;
    component.selectProject(project);
    expect(component.selectedProject).toEqual(project);
  });

  it('should back to list', () => {
    component.backToList();
    expect(component.selectedProject).toBeNull();
  });

  it('should set isMobile to true when breakpoint matches', () => {
    breakpointObserver.observe.mockReturnValue(
      of({ matches: true, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(true);
  });

  it('should set isMobile to false when breakpoint does not match', () => {
    breakpointObserver.observe.mockReturnValue(
      of({ matches: false, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile).toBe(false);
  });

  it('should handle error when loading projects', () => {
    // Simulate an error scenario by returning a throwError observable.
    projectService.projectControllerGetAllProjects = jest
      .fn()
      .mockReturnValue(throwError(() => new Error('Error')));
    component.loadProjects();
    // Verify that the API was called with the expected parameters.
    expect(projectService.projectControllerGetAllProjects).toHaveBeenCalledWith(
      'body',
      true,
      { transferCache: true }
    );
    // Since catchError converts the error to EMPTY, no projects are returned.
    expect(component.projects).toEqual([]);
    // Check that loading state is properly reset
    expect(component.isLoading).toBe(false);
    // Check that error flag is set
    expect(component.loadError).toBe(true);
  });

  it('should use retry when loading projects', () => {
    component.loadProjects();
    // Verify retry is called with the correct number of retries
    expect(retry).toHaveBeenCalledWith(component['maxRetries']);
  });

  it('should reset error state when retrying manually', () => {
    // Set initial error state
    component.isLoading = false;
    component.loadError = true;

    // Mock successful API call with a valid ProjectDto
    const testProject = {
      id: '123',
      name: 'Test Project',
      slug: 'test-project',
      title: 'Test Project',
      createdDate: new Date(),
      updatedDate: new Date(),
    } as unknown as ProjectDto;

    projectService.projectControllerGetAllProjects = jest
      .fn()
      .mockReturnValue(of([testProject]));

    // Call loadProjects (as if clicking retry button)
    component.loadProjects();

    // Check that error state is reset
    expect(component.loadError).toBe(false);
    expect(component.isLoading).toBe(false);
    expect(component.projects).toHaveLength(1);
  });

  it('should call loadProjects when new project dialog returns truthy result', () => {
    const loadProjectsSpy = jest.spyOn(component, 'loadProjects');
    // Create a fake dialog reference where afterClosed returns an observable emitting a truthy result.
    const dialogRef = {
      afterClosed: () => of(true),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    jest.spyOn(component.dialog, 'open').mockReturnValue(dialogRef as any);
    component.openNewProjectDialog();
    // The truthy result should trigger a call to loadProjects.
    expect(loadProjectsSpy).toHaveBeenCalled();
  });

  it('should not call loadProjects when new project dialog returns falsy result', () => {
    const loadProjectsSpy = jest.spyOn(component, 'loadProjects');
    // Create a fake dialog reference where afterClosed returns an observable emitting a falsy result.
    const dialogRef = {
      afterClosed: () => of(false),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    jest.spyOn(component.dialog, 'open').mockReturnValue(dialogRef as any);
    component.openNewProjectDialog();
    // No call to loadProjects should be made if the result is falsy.
    expect(loadProjectsSpy).not.toHaveBeenCalled();
  });
});
