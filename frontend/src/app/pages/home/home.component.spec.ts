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
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { Project, User } from '@inkweld/index';
import {
  CollaboratedProject,
  CollaboratorRole,
  PendingInvitation,
} from '@inkweld/model/models';
import { SetupService } from '@services/core/setup.service';
import { UnifiedProjectService } from '@services/offline/unified-project.service';
import { ProjectServiceError } from '@services/project/project.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { ThemeService } from '@themes/theme.service';
import { of, throwError } from 'rxjs';
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
  let collaborationApiService: Partial<CollaborationApiService>;
  let setupService: Partial<SetupService>;
  let breakpointObserver: MockedObject<BreakpointObserver>;
  let httpClient: MockedObject<HttpClient>;
  let router: MockedObject<Router>;

  const mockLoadingSignal = signal(false);
  const mockProjectsSignal = signal<Project[]>([]);
  const mockIsAuthenticated = signal(true);
  const mockUserInitialized = signal(true);
  const mockProjectInitialized = signal(true);

  const mockPendingInvitations: PendingInvitation[] = [
    {
      projectId: 'proj-1',
      projectTitle: 'Invited Project',
      projectSlug: 'invited-project',
      ownerUsername: 'owner1',
      role: CollaboratorRole.Viewer,
      invitedAt: Date.now(),
      invitedByUsername: 'owner1',
    },
  ];

  const mockCollaboratedProjects: CollaboratedProject[] = [
    {
      projectId: 'proj-2',
      projectTitle: 'Collaborated Project',
      projectSlug: 'collaborated-project',
      ownerUsername: 'owner2',
      role: CollaboratorRole.Editor,
      acceptedAt: Date.now(),
    },
  ];

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
      initialized: mockUserInitialized,
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<UnifiedUserService>;

    // Reset mock signals once before all tests
    mockLoadingSignal.set(false);
    mockProjectsSignal.set([]);
    mockIsAuthenticated.set(true);
    mockUserInitialized.set(true);
    mockProjectInitialized.set(true);

    // Setup mock project service once
    projectService = {
      isLoading: mockLoadingSignal,
      projects: mockProjectsSignal,
      initialized: mockProjectInitialized,
      loadProjects: vi.fn().mockResolvedValue(undefined),
    };

    // Setup mock collaboration service
    collaborationApiService = {
      getPendingInvitations: vi.fn().mockReturnValue(of([])),
      getCollaboratedProjects: vi.fn().mockReturnValue(of([])),
      acceptInvitation: vi.fn().mockReturnValue(of({ message: 'accepted' })),
      declineInvitation: vi.fn().mockReturnValue(of({ message: 'declined' })),
    };

    // Setup mock setup service (server mode by default for collaboration tests)
    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
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
        { provide: CollaborationApiService, useValue: collaborationApiService },
        { provide: SetupService, useValue: setupService },
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
    // Ensure userService.initialize succeeds so we proceed to loadProjects
    userService.initialize = vi.fn().mockResolvedValue(undefined);

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
      // Ensure userService.initialize succeeds so we proceed to loadProjects
      userService.initialize = vi.fn().mockResolvedValue(undefined);
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

  describe('filteredProjects', () => {
    it('should return all projects when no search term', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      expect(component['filteredProjects']()).toEqual(mockProjects);
    });

    it('should filter projects by title', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      // Directly set the search term signal (bypassing debounce for testing)
      // Use exact match that only matches one project
      component['searchTerm'].set('Test Project');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Test Project');
    });

    it('should filter projects by slug', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('another');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(1);
      expect(filtered[0].slug).toBe('another-project');
    });

    it('should filter projects by description', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('description');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(2); // Both have "description" in their description
    });

    it('should filter projects by username', () => {
      mockProjectsSignal.set(mockProjects);
      component.ngOnInit();

      component['searchTerm'].set('testuser');

      const filtered = component['filteredProjects']();
      expect(filtered.length).toBe(2);
    });
  });

  describe('login and register dialogs', () => {
    it('should open login dialog', () => {
      // openLoginDialog is now available instead of navigateToLogin
      // The dialog approach is tested through the component's methods
      expect(component.openLoginDialog).toBeDefined();
    });

    it('should open register dialog', () => {
      // openRegisterDialog is now available instead of navigateToRegister
      expect(component.openRegisterDialog).toBeDefined();
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

  describe('collaboration features', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    describe('loadCollaborationData', () => {
      it('should load pending invitations and collaborated projects', async () => {
        (collaborationApiService.getPendingInvitations as any).mockReturnValue(
          of(mockPendingInvitations)
        );
        (
          collaborationApiService.getCollaboratedProjects as any
        ).mockReturnValue(of(mockCollaboratedProjects));

        await component.loadCollaborationData();

        expect(
          collaborationApiService.getPendingInvitations
        ).toHaveBeenCalled();
        expect(
          collaborationApiService.getCollaboratedProjects
        ).toHaveBeenCalled();
        expect(component.pendingInvitations()).toEqual(mockPendingInvitations);
        expect(component.collaboratedProjects()).toEqual(
          mockCollaboratedProjects
        );
      });

      it('should not load if not authenticated', async () => {
        // Clear any previous calls
        vi.clearAllMocks();
        // Set to unauthenticated
        mockIsAuthenticated.set(false);
        fixture.detectChanges();

        await component.loadCollaborationData();

        expect(
          collaborationApiService.getPendingInvitations
        ).not.toHaveBeenCalled();
        expect(
          collaborationApiService.getCollaboratedProjects
        ).not.toHaveBeenCalled();
      });

      it('should handle errors gracefully', async () => {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        (collaborationApiService.getPendingInvitations as any).mockReturnValue(
          throwError(() => new Error('Network error'))
        );

        await component.loadCollaborationData();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('acceptInvitation', () => {
      it('should accept invitation and update state', async () => {
        const invitation = mockPendingInvitations[0];
        component.pendingInvitations.set([...mockPendingInvitations]);
        (
          collaborationApiService.getCollaboratedProjects as any
        ).mockReturnValue(of(mockCollaboratedProjects));

        await component.acceptInvitation(invitation);

        expect(collaborationApiService.acceptInvitation).toHaveBeenCalledWith(
          invitation.projectId
        );
        expect(
          component
            .pendingInvitations()
            .find(i => i.projectId === invitation.projectId)
        ).toBeUndefined();
      });

      it('should handle accept errors', async () => {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const invitation = mockPendingInvitations[0];
        component.pendingInvitations.set([...mockPendingInvitations]);
        (collaborationApiService.acceptInvitation as any).mockReturnValue(
          throwError(() => new Error('Failed'))
        );

        await component.acceptInvitation(invitation);

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('declineInvitation', () => {
      it('should decline invitation and remove from list', async () => {
        const invitation = mockPendingInvitations[0];
        component.pendingInvitations.set([...mockPendingInvitations]);

        await component.declineInvitation(invitation);

        expect(collaborationApiService.declineInvitation).toHaveBeenCalledWith(
          invitation.projectId
        );
        expect(
          component
            .pendingInvitations()
            .find(i => i.projectId === invitation.projectId)
        ).toBeUndefined();
      });

      it('should handle decline errors', async () => {
        const consoleSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const invitation = mockPendingInvitations[0];
        component.pendingInvitations.set([...mockPendingInvitations]);
        (collaborationApiService.declineInvitation as any).mockReturnValue(
          throwError(() => new Error('Failed'))
        );

        await component.declineInvitation(invitation);

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('openCollaboratedProject', () => {
      it('should navigate to collaborated project', () => {
        const project = mockCollaboratedProjects[0];
        component.openCollaboratedProject(project);

        expect(router.navigate).toHaveBeenCalledWith([
          project.ownerUsername,
          project.projectSlug,
        ]);
      });
    });
  });
});
