import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { ProjectDto, UserDto } from '@inkweld/index';
import { ProjectService } from '@services/project.service';
import { UserService } from '@services/user.service';
import { ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';

import { HomeComponent } from './home.component';

jest.mock('@themes/theme.service');
jest.mock('@angular/cdk/layout');

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: jest.Mocked<ThemeService>;
  let userService: jest.Mocked<UserService>;
  let projectService: Partial<ProjectService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;
  let httpClient: jest.Mocked<HttpClient>;
  let router: jest.Mocked<Router>;

  const mockLoadingSignal = signal(false);
  const mockProjectsSignal = signal<ProjectDto[]>([]);

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

    router = {
      navigate: jest.fn(),
    } as unknown as jest.Mocked<Router>;

    userService = {
      currentUser: signal<UserDto | undefined>(undefined),
    } as unknown as jest.Mocked<UserService>;

    // Reset mock signals for each test
    mockLoadingSignal.set(false);
    mockProjectsSignal.set([]);

    // Setup mock project service
    projectService = {
      isLoading: mockLoadingSignal,
      projects: mockProjectsSignal,
      loadAllProjects: jest.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent, NoopAnimationsModule],
      providers: [
        provideRouter([
          { path: '', component: HomeComponent },
          { path: ':id', component: HomeComponent },
        ]),
        provideLocationMocks(),
        { provide: ThemeService, useValue: themeService },
        { provide: UserService, useValue: userService },
        { provide: ProjectService, useValue: projectService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
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

  it('should load projects on init', () => {
    component.ngOnInit();
    expect(projectService.loadAllProjects).toHaveBeenCalled();
  });

  it('should setup breakpoint observer on init', () => {
    component.ngOnInit();
    expect(breakpointObserver.observe).toHaveBeenCalledWith([
      Breakpoints.XSmall,
      Breakpoints.Small,
    ]);
  });

  it('should navigate to project when selecting a project', () => {
    const project = {
      id: '123',
      name: 'Test Project',
      slug: 'test-project',

      username: 'testuser',
    } as unknown as ProjectDto;
    component.selectProject(project);
    expect(router.navigate).toHaveBeenCalledWith(['testuser', 'test-project']);
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

  it('should handle error when loading projects', async () => {
    // Simulate an error scenario
    const loadError = new Error('Failed to load projects');
    projectService.loadAllProjects = jest.fn().mockRejectedValue(loadError);

    await component.loadProjects();

    // Check that error flag is set
    expect(component['loadError']).toBe(true);
  });

  it('should call loadProjects when new project dialog returns truthy result', () => {
    const loadProjectsSpy = jest
      .spyOn(component, 'loadProjects')
      .mockResolvedValue();
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
    const loadProjectsSpy = jest
      .spyOn(component, 'loadProjects')
      .mockResolvedValue();
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
