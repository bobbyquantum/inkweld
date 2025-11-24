import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { Project, User } from '@inkweld/index';
import { ProjectServiceError } from '@services/project.service';
import { UnifiedProjectService } from '@services/unified-project.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { HomeComponent } from './home.component';

vi.mock('@themes/theme.service');
vi.mock('@angular/cdk/layout');

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: MockedObject<ThemeService>;
  let userService: MockedObject<UnifiedUserService>;
  let projectService: Partial<UnifiedProjectService>;
  let breakpointObserver: MockedObject<BreakpointObserver>;
  let httpClient: MockedObject<HttpClient>;
  let router: MockedObject<Router>;

  const mockLoadingSignal = signal(false);
  const mockProjectsSignal = signal<Project[]>([]);
  const mockIsAuthenticated = signal(true);

  const mockProjects: Project[] = [
    {
      id: '1',
      title: 'Test Project',
      slug: 'test-project',
      username: 'testuser',
      description: 'A test project description',
      createdDate: '2024-01-01',
      updatedDate: '2024-01-01',
    },
    {
      id: '2',
      title: 'Another Project',
      slug: 'another-project',
      username: 'testuser',
      description: 'Another description',
      createdDate: '2024-01-02',
      updatedDate: '2024-01-02',
      coverImage: 'cover.jpg',
    },
  ];

  beforeEach(async () => {
    themeService = {
      update: vi.fn(),
      isDarkMode: vi.fn(),
    } as unknown as MockedObject<ThemeService>;

    breakpointObserver = {
      observe: vi.fn().mockReturnValue(of({ matches: true, breakpoints: {} })),
    } as unknown as MockedObject<BreakpointObserver>;

    httpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as MockedObject<HttpClient>;

    router = { navigate: vi.fn() } as unknown as MockedObject<Router>;

    userService = {
      currentUser: signal<User | undefined>(undefined),
      isAuthenticated: mockIsAuthenticated,
    } as unknown as MockedObject<UnifiedUserService>;

    // Reset mock signals once before all tests
    mockLoadingSignal.set(false);
    mockProjectsSignal.set([]);
    mockIsAuthenticated.set(true);

    // Setup mock project service once
    projectService = {
      isLoading: mockLoadingSignal,
      projects: mockProjectsSignal,
      loadProjects: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideZonelessChangeDetection(),
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
    } as unknown as Project;
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

  describe('loadProjects', () => {
    it('should not load projects when user is not authenticated', async () => {
      mockIsAuthenticated.set(false);

      await component.loadProjects();

      expect(projectService.loadProjects).not.toHaveBeenCalled();
    });

    it('should handle session expired error without setting loadError', async () => {
      const sessionError = new ProjectServiceError(
        'SESSION_EXPIRED',
        'Session expired'
      );
      projectService.loadProjects = vi.fn().mockRejectedValue(sessionError);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await component.loadProjects();

      expect(component.loadError).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('side navigation', () => {
    it('should toggle side nav', () => {
      component.sideNavOpen.set(true);
      component.toggleSideNav();
      expect(component.sideNavOpen()).toBe(false);

      component.toggleSideNav();
      expect(component.sideNavOpen()).toBe(true);
    });

    it('should close side nav on mobile breakpoint', () => {
      breakpointObserver.observe.mockReturnValue(
        of({ matches: true, breakpoints: {} })
      );
      component.sideNavOpen.set(true);

      component.ngOnInit();

      expect(component.sideNavOpen()).toBe(false);
    });

    it('should open side nav on desktop breakpoint', () => {
      breakpointObserver.observe.mockReturnValue(
        of({ matches: false, breakpoints: {} })
      );
      component.sideNavOpen.set(false);

      component.ngOnInit();

      expect(component.sideNavOpen()).toBe(true);
    });
  });

  describe('mobile search', () => {
    it('should toggle mobile search mode', () => {
      expect(component.mobileSearchActive()).toBe(false);

      component.toggleMobileSearch();
      expect(component.mobileSearchActive()).toBe(true);

      component.toggleMobileSearch();
      expect(component.mobileSearchActive()).toBe(false);
    });

    it('should clear search when closing mobile search', () => {
      component.searchControl.setValue('test query');
      component.mobileSearchActive.set(true);

      component.toggleMobileSearch();

      expect(component.searchControl.value).toBe('');
    });
  });

  describe('view mode', () => {
    it('should set view mode to tiles', () => {
      component.setViewMode('tiles');
      expect(component.viewMode()).toBe('tiles');
    });

    it('should set view mode to list', () => {
      component.setViewMode('list');
      expect(component.viewMode()).toBe('list');
    });

    it('should set view mode to bookshelf', () => {
      component.setViewMode('bookshelf');
      expect(component.viewMode()).toBe('bookshelf');
    });
  });

  describe('getCoverUrl', () => {
    it('should return null when project has no cover image', () => {
      const project = { ...mockProjects[0], coverImage: undefined };
      expect(component.getCoverUrl(project)).toBeNull();
    });

    it('should return cover URL for project with cover image on localhost', () => {
      // Mock window.location for localhost
      Object.defineProperty(window, 'location', {
        value: { hostname: 'localhost', origin: 'http://localhost:4200' },
        writable: true,
      });

      const project = mockProjects[1]; // Has coverImage
      const url = component.getCoverUrl(project);

      expect(url).toBe(
        'http://localhost:8333/api/v1/projects/testuser/another-project/cover'
      );
    });

    it('should return cover URL for project with cover image on production', () => {
      // Mock window.location for production
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'inkweld.app',
          origin: 'https://inkweld.app',
        },
        writable: true,
      });

      const project = mockProjects[1];
      const url = component.getCoverUrl(project);

      expect(url).toBe(
        'https://inkweld.app/api/v1/projects/testuser/another-project/cover'
      );
    });
  });

  describe('filteredProjects', () => {
    it('should return all projects when no search term', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      expect(component['filteredProjects']()).toEqual(mockProjects);
    });

    it('should filter projects by title', async () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      // Directly set the search term signal (bypassing debounce for testing)
      // Use exact match that only matches one project
      component['searchTerm'].set('Test Project');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Test Project');
    });

    it('should filter projects by slug', async () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('another');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].slug).toBe('another-project');
    });

    it('should filter projects by description', async () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('description');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(2); // Both have "description" in their description
    });

    it('should filter projects by username', async () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('testuser');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(2);
    });
  });

  describe('navigation', () => {
    it('should navigate to login page', () => {
      component.navigateToLogin();
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
    });

    it('should navigate to register page', () => {
      component.navigateToRegister();
      expect(router.navigate).toHaveBeenCalledWith(['/register']);
    });
  });

  describe('cleanup', () => {
    it('should complete destroy$ on ngOnDestroy', () => {
      const nextSpy = vi.spyOn(component['destroy$'], 'next');
      const completeSpy = vi.spyOn(component['destroy$'], 'complete');

      component.ngOnDestroy();

      expect(nextSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });
});
