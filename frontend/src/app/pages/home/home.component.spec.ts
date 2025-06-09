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
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';

import { HomeComponent } from './home.component';

vi.mock('@themes/theme.service');
vi.mock('@angular/cdk/layout');

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: vi.Mocked<ThemeService>;
  let userService: vi.Mocked<UnifiedUserService>;
  let projectService: Partial<UnifiedProjectService>;
  let breakpointObserver: vi.Mocked<BreakpointObserver>;
  let httpClient: vi.Mocked<HttpClient>;
  let router: vi.Mocked<Router>;

  const mockLoadingSignal = signal(false);
  const mockProjectsSignal = signal<ProjectDto[]>([]);

  beforeEach(async () => {
    themeService = {
      update: vi.fn(),
      isDarkMode: vi.fn(),
    } as unknown as vi.Mocked<ThemeService>;

    breakpointObserver = {
      observe: vi
        .fn()
        .mockReturnValue(of({ matches: true, breakpoints: {} })),
    } as unknown as vi.Mocked<BreakpointObserver>;

    httpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as vi.Mocked<HttpClient>;

    router = { navigate: vi.fn() } as unknown as vi.Mocked<Router>;

    userService = {
      currentUser: signal<UserDto | undefined>(undefined),
      isAuthenticated: signal(true),
    } as unknown as vi.Mocked<UnifiedUserService>;

    // Reset mock signals once before all tests
    mockLoadingSignal.set(false);
    mockProjectsSignal.set([]);

    // Setup mock project service once
    projectService = {
      isLoading: mockLoadingSignal,
      projects: mockProjectsSignal,
      loadProjects: vi.fn().mockResolvedValue(undefined),
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
        { provide: UnifiedUserService, useValue: userService },
        { provide: UnifiedProjectService, useValue: projectService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: '123' })) },
        },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load projects on init', () => {
    const loadProjectsSpy = vi.spyOn(component as any, 'loadProjects');
    component.ngOnInit();
    expect(loadProjectsSpy).toHaveBeenCalled();
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
    expect(router.navigate).toHaveBeenCalledWith(['testuser', 'test-project'], {
      onSameUrlNavigation: 'reload',
      skipLocationChange: false,
      replaceUrl: false,
    });
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
    projectService.loadProjects = vi.fn().mockRejectedValue(loadError);

    await component.loadProjects();

    // Check that error flag is set
    expect((component as any).loadError).toBe(true);
  });

  it('should navigate to create-project route when openNewProjectDialog is called', () => {
    // Call the method
    component.openNewProjectDialog();

    // Verify that router.navigate was called with the correct route
    expect(router.navigate).toHaveBeenCalledWith(['/create-project']);
  });
});
