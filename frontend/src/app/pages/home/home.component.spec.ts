import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideLocationMocks } from '@angular/common/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { type ProjectCardComponent } from '@components/project-card/project-card.component';
import { LoginDialogComponent } from '@dialogs/login-dialog/login-dialog.component';
import { RegisterDialogComponent } from '@dialogs/register-dialog/register-dialog.component';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { type Project, type User } from '@inkweld/index';
import {
  type CollaboratedProject,
  CollaboratorRole,
  type PendingInvitation,
} from '@inkweld/model/models';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { ProjectActivationService } from '@services/local/project-activation.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectServiceError } from '@services/project/project.service';
import { CoverSyncService } from '@services/sync/cover-sync.service';
import { SyncQueueService } from '@services/sync/sync-queue.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { ThemeService } from '@themes/theme.service';
import { of, throwError } from 'rxjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let themeService: MockedObject<ThemeService>;
  let userService: MockedObject<UnifiedUserService>;
  let avatarUserService: Partial<UserService>;
  let projectService: Partial<UnifiedProjectService>;
  let localStorageService: Partial<LocalStorageService>;
  let collaborationApiService: Partial<CollaborationApiService>;
  let setupService: Partial<SetupService>;
  let dialogGateway: Partial<DialogGatewayService>;
  let breakpointObserver: MockedObject<BreakpointObserver>;
  let httpClient: MockedObject<HttpClient>;
  let router: MockedObject<Router>;
  let matDialog: MockedObject<MatDialog>;
  let snackBar: MockedObject<MatSnackBar>;
  let coverSyncService: { syncCovers: ReturnType<typeof vi.fn> };
  let mockSyncQueueService: {
    isSyncing: ReturnType<typeof signal<boolean>>;
    syncAllProjects: ReturnType<typeof vi.fn>;
    cancelSync: ReturnType<typeof vi.fn>;
    statusVersion: ReturnType<typeof signal<number>>;
    getProjectStatus: ReturnType<typeof vi.fn>;
  };
  let mockActivationService: {
    initialize: ReturnType<typeof vi.fn>;
    isActivated: ReturnType<typeof vi.fn>;
    isActivationRequired: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    activationVersion: ReturnType<typeof signal<number>>;
  };

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
      request: vi.fn().mockReturnValue(of({})),
    } as unknown as MockedObject<HttpClient>;

    router = {
      navigate: vi.fn(),
      url: '/',
    } as unknown as MockedObject<Router>;

    matDialog = {
      open: vi.fn(),
    } as unknown as MockedObject<MatDialog>;

    snackBar = {
      open: vi.fn().mockReturnValue({
        onAction: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
      }),
    } as unknown as MockedObject<MatSnackBar>;

    const mockUser: User = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      enabled: true,
    };

    userService = {
      currentUser: signal<User | undefined>(mockUser),
      isAuthenticated: mockIsAuthenticated,
      initialized: mockUserInitialized,
      initialize: vi.fn().mockResolvedValue(undefined),
      getMode: vi.fn().mockReturnValue('server'),
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

    // Setup mock offline storage service (for UserAvatarComponent)
    localStorageService = {
      getUserAvatarUrl: vi.fn().mockResolvedValue(undefined),
      saveUserAvatar: vi.fn().mockResolvedValue(undefined),
      getMediaUrl: vi.fn().mockResolvedValue(undefined),
    };

    // Setup mock user service (for UserAvatarComponent avatar loading)
    // Note: SideNavComponent now uses UnifiedUserService which is already mocked above
    avatarUserService = {
      getUserAvatar: vi.fn().mockReturnValue(of(new Blob())),
    };

    // Setup mock setup service (server mode by default for collaboration tests)
    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    // Setup mock dialog gateway service
    dialogGateway = {
      openImportProjectDialog: vi.fn().mockResolvedValue(undefined),
    };

    // Setup mock cover sync service
    coverSyncService = {
      syncCovers: vi.fn().mockResolvedValue(undefined),
    };

    mockSyncQueueService = {
      isSyncing: signal(false),
      syncAllProjects: vi.fn().mockResolvedValue(undefined),
      cancelSync: vi.fn(),
      statusVersion: signal(0),
      getProjectStatus: vi.fn().mockReturnValue(undefined),
    };

    mockActivationService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      isActivated: vi.fn().mockReturnValue(true),
      isActivationRequired: vi.fn().mockReturnValue(false),
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
      activationVersion: signal(0),
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
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: LocalStorageService, useValue: localStorageService },
        { provide: UserService, useValue: avatarUserService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: matDialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: CoverSyncService, useValue: coverSyncService },
        { provide: SyncQueueService, useValue: mockSyncQueueService },
        {
          provide: StorageContextService,
          useValue: {
            getPrefix: vi.fn().mockReturnValue('srv:test:'),
            configurations: signal([]),
            activeConfig: signal(null),
            isLocalMode: signal(false),
            isConfigured: signal(false),
            hasConfigurations: signal(false),
            prefixDbName: vi.fn((name: string) => `srv:test:${name}`),
          },
        },
        {
          provide: ProjectActivationService,
          useValue: mockActivationService,
        },
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

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
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
    expect(component.isMobile()).toBe(true);
  });

  it('should set isMobile to false when breakpoint does not match', () => {
    breakpointObserver.observe.mockReturnValue(
      of({ matches: false, breakpoints: {} })
    );
    component.ngOnInit();
    expect(component.isMobile()).toBe(false);
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

  it('should open import project dialog when importProject is called', () => {
    component.importProject();
    expect(dialogGateway.openImportProjectDialog).toHaveBeenCalledWith(
      'testuser'
    );
  });

  it('should reload projects after successful import', async () => {
    (
      dialogGateway.openImportProjectDialog as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ success: true, slug: 'imported-project' });

    component.importProject();

    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect(projectService.loadProjects).toHaveBeenCalled();
    });
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

    describe('dialogs', () => {
      let matDialog: MockedObject<MatDialog>;

      beforeEach(() => {
        matDialog = TestBed.inject(MatDialog) as MockedObject<MatDialog>;
      });

      it('should open login dialog', () => {
        const dialogRef = {
          afterClosed: vi.fn().mockReturnValue(of(true)),
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        matDialog.open.mockReturnValue(dialogRef as any);

        component.openLoginDialog();

        expect(matDialog.open).toHaveBeenCalledWith(
          LoginDialogComponent,
          expect.any(Object)
        );
      });

      it('should open register dialog when login dialog returns "register"', () => {
        const loginDialogRef = {
          afterClosed: vi.fn().mockReturnValue(of('register')),
        };
        const registerDialogRef = {
          afterClosed: vi.fn().mockReturnValue(of(true)),
        };

        matDialog.open
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .mockReturnValueOnce(loginDialogRef as any)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .mockReturnValueOnce(registerDialogRef as any);

        component.openLoginDialog();

        expect(matDialog.open).toHaveBeenCalledWith(
          LoginDialogComponent,
          expect.any(Object)
        );
        expect(matDialog.open).toHaveBeenCalledWith(
          RegisterDialogComponent,
          expect.any(Object)
        );
      });

      it('should open register dialog', () => {
        const dialogRef = {
          afterClosed: vi.fn().mockReturnValue(of(true)),
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        matDialog.open.mockReturnValue(dialogRef as any);

        component.openRegisterDialog();

        expect(matDialog.open).toHaveBeenCalledWith(
          RegisterDialogComponent,
          expect.any(Object)
        );
      });

      it('should open login dialog when register dialog returns "login"', () => {
        const registerDialogRef = {
          afterClosed: vi.fn().mockReturnValue(of('login')),
        };
        const loginDialogRef = {
          afterClosed: vi.fn().mockReturnValue(of(true)),
        };

        matDialog.open
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .mockReturnValueOnce(registerDialogRef as any)
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .mockReturnValueOnce(loginDialogRef as any);

        component.openRegisterDialog();

        expect(matDialog.open).toHaveBeenCalledWith(
          RegisterDialogComponent,
          expect.any(Object)
        );
        expect(matDialog.open).toHaveBeenCalledWith(
          LoginDialogComponent,
          expect.any(Object)
        );
      });

      it('should navigate to login/register', () => {
        const dialogRef = {
          afterClosed: vi.fn().mockReturnValue(of(true)),
        };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        matDialog.open.mockReturnValue(dialogRef as any);

        const openLoginSpy = vi.spyOn(component, 'openLoginDialog');
        const openRegisterSpy = vi.spyOn(component, 'openRegisterDialog');

        component.navigateToLogin();
        expect(openLoginSpy).toHaveBeenCalled();

        component.navigateToRegister();
        expect(openRegisterSpy).toHaveBeenCalled();
      });
    });

    describe('allProjects computed', () => {
      it('should combine own and shared projects', () => {
        mockProjectsSignal.set(mockProjects);
        component.collaboratedProjects.set(mockCollaboratedProjects);

        const all = component['allProjects']();
        expect(all.length).toBe(3);
        expect(all.find(p => p.isShared)).toBeTruthy();
        expect(all.find(p => !p.isShared)).toBeTruthy();
      });

      it('should filter projects by search term', () => {
        vi.useFakeTimers();
        mockProjectsSignal.set(mockProjects);
        component.collaboratedProjects.set(mockCollaboratedProjects);

        // Search for "Another" (matches one own project)
        component.searchControl.setValue('Another');
        // Wait for debounce
        vi.advanceTimersByTime(300);

        const filtered = component['allProjects']();
        expect(filtered.length).toBe(1);
        expect(filtered[0].project.title).toBe('Another Project');
      });
    });
  });

  describe('cover sync', () => {
    it('should trigger cover sync after loading projects', async () => {
      mockProjectsSignal.set(mockProjects);
      userService.initialize = vi.fn().mockResolvedValue(undefined);

      await component.loadProjects();

      expect(coverSyncService.syncCovers).toHaveBeenCalledWith(mockProjects);
    });

    it('should trigger cover sync when returning to home with cached projects', async () => {
      mockProjectsSignal.set(mockProjects);
      mockProjectInitialized.set(true);

      await component.loadProjects();

      expect(coverSyncService.syncCovers).toHaveBeenCalledWith(mockProjects);
    });

    it('should not trigger cover sync in local mode', async () => {
      mockProjectsSignal.set(mockProjects);
      mockProjectInitialized.set(true);
      (setupService.getMode as ReturnType<typeof vi.fn>).mockReturnValue(
        'local'
      );

      await component.loadProjects();

      expect(coverSyncService.syncCovers).not.toHaveBeenCalled();
    });

    it('should not trigger cover sync when not authenticated', async () => {
      mockProjectsSignal.set(mockProjects);
      mockProjectInitialized.set(true);
      mockIsAuthenticated.set(false);

      await component.loadProjects();

      expect(coverSyncService.syncCovers).not.toHaveBeenCalled();
    });
  });

  describe('project activation', () => {
    beforeEach(() => {
      mockProjectsSignal.set(mockProjects);
      fixture.detectChanges();
    });

    describe('isProjectActivated', () => {
      it('should return true when activation service reports activated', () => {
        mockActivationService.isActivated.mockReturnValue(true);
        expect(component.isProjectActivated(mockProjects[0])).toBe(true);
        expect(mockActivationService.isActivated).toHaveBeenCalledWith(
          'testuser/test-project'
        );
      });

      it('should return false when activation service reports not activated', () => {
        mockActivationService.isActivated.mockReturnValue(false);
        expect(component.isProjectActivated(mockProjects[0])).toBe(false);
      });
    });

    describe('onProjectClick', () => {
      it('should navigate to project when activated', () => {
        mockActivationService.isActivated.mockReturnValue(true);
        const event = new MouseEvent('click');

        component.onProjectClick(mockProjects[0], event);

        expect(router.navigate).toHaveBeenCalledWith(
          ['testuser', 'test-project'],
          expect.any(Object)
        );
      });

      it('should suppress click when card reports long-press', () => {
        const event = new MouseEvent('click');
        const preventSpy = vi.spyOn(event, 'preventDefault');
        const stopSpy = vi.spyOn(event, 'stopPropagation');
        const card = {
          wasLongPress: () => true,
        } as unknown as ProjectCardComponent;

        component.onProjectClick(mockProjects[0], event, card);

        expect(preventSpy).toHaveBeenCalled();
        expect(stopSpy).toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
      });

      it('should open activation dialog for deactivated project', () => {
        mockActivationService.isActivated.mockReturnValue(false);
        const event = new MouseEvent('click');
        const preventSpy = vi.spyOn(event, 'preventDefault');
        const afterClosedSubject = { subscribe: vi.fn() };
        matDialog.open.mockReturnValue({
          afterClosed: () => afterClosedSubject,
        } as unknown as MatDialogRef<unknown>);

        component.onProjectClick(mockProjects[0], event);

        expect(preventSpy).toHaveBeenCalled();
        expect(matDialog.open).toHaveBeenCalled();
        const dialogData = matDialog.open.mock.calls[0][1]?.data as Record<
          string,
          unknown
        >;
        expect(dialogData['title']).toBe('Activate Project');
      });

      it('should activate and sync when activation dialog confirmed', async () => {
        mockActivationService.isActivated.mockReturnValue(false);
        const event = new MouseEvent('click');
        let afterClosedCb: (val: boolean) => void;
        matDialog.open.mockReturnValue({
          afterClosed: () => ({
            subscribe: (cb: (val: boolean) => void) => {
              afterClosedCb = cb;
            },
          }),
        } as unknown as MatDialogRef<unknown>);

        component.onProjectClick(mockProjects[0], event);
        afterClosedCb!(true);

        // Wait for async activate
        await vi.waitFor(() => {
          expect(mockActivationService.activate).toHaveBeenCalledWith(
            'testuser/test-project'
          );
        });
      });

      it('should not activate when activation dialog cancelled', () => {
        mockActivationService.isActivated.mockReturnValue(false);
        const event = new MouseEvent('click');
        let afterClosedCb: (val: boolean) => void;
        matDialog.open.mockReturnValue({
          afterClosed: () => ({
            subscribe: (cb: (val: boolean) => void) => {
              afterClosedCb = cb;
            },
          }),
        } as unknown as MatDialogRef<unknown>);

        component.onProjectClick(mockProjects[0], event);
        afterClosedCb!(false);

        expect(mockActivationService.activate).not.toHaveBeenCalled();
      });
    });

    describe('onProjectLongPress', () => {
      it('should do nothing for deactivated project', () => {
        mockActivationService.isActivated.mockReturnValue(false);

        component.onProjectLongPress(mockProjects[0]);

        expect(matDialog.open).not.toHaveBeenCalled();
      });

      it('should open deactivation dialog for activated project', () => {
        mockActivationService.isActivated.mockReturnValue(true);
        const afterClosedSubject = { subscribe: vi.fn() };
        matDialog.open.mockReturnValue({
          afterClosed: () => afterClosedSubject,
        } as unknown as MatDialogRef<unknown>);

        component.onProjectLongPress(mockProjects[0]);

        expect(matDialog.open).toHaveBeenCalled();
        const dialogData = matDialog.open.mock.calls[0][1]?.data as Record<
          string,
          unknown
        >;
        expect(dialogData['title']).toBe('Deactivate Project');
      });

      it('should deactivate when dialog confirmed', async () => {
        mockActivationService.isActivated.mockReturnValue(true);
        let afterClosedCb: (val: boolean) => void;
        matDialog.open.mockReturnValue({
          afterClosed: () => ({
            subscribe: (cb: (val: boolean) => void) => {
              afterClosedCb = cb;
            },
          }),
        } as unknown as MatDialogRef<unknown>);

        component.onProjectLongPress(mockProjects[0]);
        afterClosedCb!(true);

        await vi.waitFor(() => {
          expect(mockActivationService.deactivate).toHaveBeenCalledWith(
            'testuser/test-project'
          );
        });
      });
    });

    describe('syncAllProjects', () => {
      it('should show snack bar when no activated projects', () => {
        mockActivationService.isActivationRequired.mockReturnValue(true);
        mockActivationService.isActivated.mockReturnValue(false);

        component.syncAllProjects();

        expect(snackBar.open).toHaveBeenCalledWith(
          'No activated projects to sync',
          'Dismiss',
          { duration: 3000 }
        );
      });

      it('should sync only activated projects', () => {
        mockActivationService.isActivationRequired.mockReturnValue(true);
        mockActivationService.isActivated.mockImplementation(
          (key: string) => key === 'testuser/test-project'
        );

        component.syncAllProjects();

        expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ slug: 'test-project' }),
          ])
        );
      });

      it('should sync all projects when activation not required', () => {
        mockActivationService.isActivationRequired.mockReturnValue(false);

        component.syncAllProjects();

        expect(mockSyncQueueService.syncAllProjects).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ slug: 'test-project' }),
            expect.objectContaining({ slug: 'another-project' }),
          ])
        );
      });
    });

    describe('cancelSync', () => {
      it('should cancel sync and show snack bar', () => {
        component.cancelSync();

        expect(mockSyncQueueService.cancelSync).toHaveBeenCalled();
        expect(snackBar.open).toHaveBeenCalledWith(
          'Sync cancelled',
          'Dismiss',
          { duration: 3000 }
        );
      });
    });

    describe('canSyncAll', () => {
      it('should be false when sync is in progress', () => {
        mockSyncQueueService.isSyncing.set(true);
        expect(component['canSyncAll']()).toBe(false);
        mockSyncQueueService.isSyncing.set(false);
      });

      it('should be false when no activated projects', () => {
        mockActivationService.isActivationRequired.mockReturnValue(true);
        mockActivationService.isActivated.mockReturnValue(false);
        expect(component['canSyncAll']()).toBe(false);
      });
    });

    describe('syncAllTooltip', () => {
      it('should show offline message when not online', () => {
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
        expect(component['syncAllTooltip']()).toBe('Cannot sync while offline');
        Object.defineProperty(navigator, 'onLine', {
          value: true,
          configurable: true,
        });
      });

      it('should show sync in progress message', () => {
        mockSyncQueueService.isSyncing.set(true);
        expect(component['syncAllTooltip']()).toBe('Sync in progress...');
        mockSyncQueueService.isSyncing.set(false);
      });

      it('should show no activated projects message', () => {
        mockActivationService.isActivationRequired.mockReturnValue(true);
        mockActivationService.isActivated.mockReturnValue(false);
        expect(component['syncAllTooltip']()).toBe(
          'No activated projects to sync'
        );
      });
    });
  });
});
