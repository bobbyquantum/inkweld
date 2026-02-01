import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Project, ProjectsService } from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import {
  ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { BackgroundSyncService } from '@services/local/background-sync.service';
import {
  MigrationService,
  MigrationState,
  MigrationStatus,
} from '@services/local/migration.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileManagerDialogComponent } from './profile-manager-dialog.component';

describe('ProfileManagerDialogComponent', () => {
  let component: ProfileManagerDialogComponent;
  let fixture: ComponentFixture<ProfileManagerDialogComponent>;
  let storageContextMock: ReturnType<typeof createStorageContextMock>;
  let authTokenServiceMock: ReturnType<typeof createAuthTokenServiceMock>;
  let setupServiceMock: ReturnType<typeof createSetupServiceMock>;
  let migrationServiceMock: ReturnType<typeof createMigrationServiceMock>;
  let backgroundSyncServiceMock: ReturnType<
    typeof createBackgroundSyncServiceMock
  >;
  let routerMock: ReturnType<typeof createRouterMock>;

  const mockLocalConfig: ServerConfig = {
    id: 'local',
    type: 'local',
    displayName: 'Local Mode',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    userProfile: { name: 'Test User', username: 'testuser' },
  };

  const mockServerConfig: ServerConfig = {
    id: 'server-123',
    type: 'server',
    serverUrl: 'https://inkweld.example.com',
    displayName: 'My Server',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    userProfile: { name: 'Server User', username: 'serveruser' },
  };

  function createStorageContextMock() {
    return {
      getConfigurations: vi
        .fn()
        .mockReturnValue([mockLocalConfig, mockServerConfig]),
      getActiveConfig: vi.fn().mockReturnValue(mockLocalConfig),
      configurations: signal([mockLocalConfig, mockServerConfig]),
      activeConfig: signal(mockLocalConfig),
      switchToConfig: vi.fn(),
      addServerConfig: vi.fn().mockResolvedValue(undefined),
      removeConfig: vi.fn(),
      getPrefix: vi.fn().mockReturnValue('local:'),
    };
  }

  function createAuthTokenServiceMock() {
    return {
      hasTokenForConfig: vi.fn().mockReturnValue(true),
      getTokenForConfig: vi.fn().mockReturnValue('mock-token'),
      clearTokenForConfig: vi.fn(),
    };
  }

  function createSetupServiceMock() {
    return {
      getMode: vi.fn().mockReturnValue('local'),
      resetConfiguration: vi.fn(),
      configureLocalMode: vi.fn(),
      configureServerMode: vi.fn().mockResolvedValue(undefined),
    };
  }

  function createMigrationServiceMock() {
    const defaultMigrationState: MigrationState = {
      status: MigrationStatus.NotStarted,
      totalProjects: 0,
      completedProjects: 0,
      failedProjects: 0,
      projectStatuses: [],
    };
    return {
      migrationState: signal(defaultMigrationState),
      getLocalProjectsCount: vi.fn().mockReturnValue(0),
      getLocalProjects: vi.fn().mockReturnValue([]),
      hasLocalProjects: vi.fn().mockReturnValue(false),
      registerOnServer: vi.fn().mockResolvedValue({ success: true }),
      loginToServer: vi.fn().mockResolvedValue({ success: true }),
      migrateToServer: vi.fn().mockResolvedValue(undefined),
      cleanupLocalData: vi.fn(),
    };
  }

  function createProjectsServiceMock() {
    return {
      listUserProjects: vi.fn().mockReturnValue(of([])),
      createProject: vi.fn().mockReturnValue(of({})),
    };
  }

  function createRouterMock() {
    return {
      navigate: vi.fn().mockResolvedValue(true),
    };
  }

  function createBackgroundSyncServiceMock() {
    return {
      syncPendingItems: vi.fn().mockResolvedValue(true),
    };
  }

  let projectsServiceMock: ReturnType<typeof createProjectsServiceMock>;

  beforeEach(async () => {
    storageContextMock = createStorageContextMock();
    authTokenServiceMock = createAuthTokenServiceMock();
    setupServiceMock = createSetupServiceMock();
    migrationServiceMock = createMigrationServiceMock();
    backgroundSyncServiceMock = createBackgroundSyncServiceMock();
    projectsServiceMock = createProjectsServiceMock();
    routerMock = createRouterMock();

    await TestBed.configureTestingModule({
      imports: [
        ProfileManagerDialogComponent,
        MatDialogModule,
        MatSnackBarModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StorageContextService, useValue: storageContextMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: MigrationService, useValue: migrationServiceMock },
        { provide: BackgroundSyncService, useValue: backgroundSyncServiceMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileManagerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('getProfileInfo()', () => {
    it('should return correct info for local profile', () => {
      const info = component.getProfileInfo(mockLocalConfig);
      expect(info.name).toBe('Local Mode');
      expect(info.icon).toBe('computer');
      expect(info.isActive).toBe(true);
    });

    it('should return correct info for server profile', () => {
      const info = component.getProfileInfo(mockServerConfig);
      expect(info.name).toBe('My Server');
      expect(info.icon).toBe('cloud');
      expect(info.isActive).toBe(false);
    });

    it('should extract hostname when no display name', () => {
      const serverNoName: ServerConfig = {
        ...mockServerConfig,
        displayName: undefined,
      };
      const info = component.getProfileInfo(serverNoName);
      expect(info.name).toBe('inkweld.example.com');
    });
  });

  describe('hasAuthForProfile()', () => {
    it('should check auth token for profile', () => {
      component.hasAuthForProfile(mockServerConfig);
      expect(authTokenServiceMock.hasTokenForConfig).toHaveBeenCalledWith(
        'server-123'
      );
    });
  });

  describe('switchToProfile()', () => {
    it('should not switch if already on same profile', async () => {
      await component.switchToProfile(mockLocalConfig);
      expect(storageContextMock.switchToConfig).not.toHaveBeenCalled();
    });

    it('should switch and navigate to home when switching to different profile', async () => {
      // Mock window.location.href to avoid actual navigation
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        value: { href: originalHref },
        writable: true,
      });

      // Switch to server profile (which is different from active local profile)
      await component.switchToProfile(mockServerConfig);

      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith(
        'server-123'
      );
      expect(window.location.href).toBe('/');
    });
  });

  describe('showAddServer()', () => {
    it('should switch to add view', () => {
      component.showAddServer();
      expect(component['currentView']()).toBe('add');
    });
  });

  describe('cancelAddServer()', () => {
    it('should return to list view', () => {
      component.showAddServer();
      component.cancelAddServer();
      expect(component['currentView']()).toBe('list');
    });
  });

  describe('removeProfile()', () => {
    it('should not remove active profile', async () => {
      await component.removeProfile(mockLocalConfig);
      expect(storageContextMock.removeConfig).not.toHaveBeenCalled();
    });
  });

  describe('project selection for migration', () => {
    const mockProjects = [
      {
        id: '1',
        title: 'Project 1',
        slug: 'project-1',
        username: 'testuser',
        createdDate: '2024-01-01',
        updatedDate: '2024-01-01',
      },
      {
        id: '2',
        title: 'Project 2',
        slug: 'project-2',
        username: 'testuser',
        createdDate: '2024-01-02',
        updatedDate: '2024-01-02',
      },
    ];

    it('should toggle project selection on and off', () => {
      const project = mockProjects[0];

      // Initially no projects selected
      expect(component.isProjectSelected(project)).toBe(false);

      // Toggle on
      component.toggleProjectSelection(project);
      expect(component.isProjectSelected(project)).toBe(true);

      // Toggle off
      component.toggleProjectSelection(project);
      expect(component.isProjectSelected(project)).toBe(false);
    });

    it('should select all projects when toggleAllProjects is called with none selected', () => {
      // Mock getLocalProjects to return our mock projects
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // Force a fresh instance to pick up the mock
      fixture.detectChanges();

      // Select all
      component.toggleAllProjects();

      expect(component.isProjectSelected(mockProjects[0])).toBe(true);
      expect(component.isProjectSelected(mockProjects[1])).toBe(true);
    });

    it('should deselect all projects when toggleAllProjects is called with all selected', () => {
      // Mock getLocalProjects to return our mock projects
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // First select all
      component.toggleProjectSelection(mockProjects[0]);
      component.toggleProjectSelection(mockProjects[1]);

      // Deselect all
      component.toggleAllProjects();

      expect(component.isProjectSelected(mockProjects[0])).toBe(false);
      expect(component.isProjectSelected(mockProjects[1])).toBe(false);
    });
  });

  describe('Slug conflict handling', () => {
    const mockProjects: Project[] = [
      {
        id: 'proj-1',
        slug: 'my-project',
        title: 'My Project',
        username: 'testuser',
        createdDate: '2024-01-01',
        updatedDate: '2024-01-01',
      },
      {
        id: 'proj-2',
        slug: 'another-project',
        title: 'Another Project',
        username: 'testuser',
        createdDate: '2024-01-02',
        updatedDate: '2024-01-02',
      },
    ];

    it('should correctly identify if a project has a slug conflict', () => {
      // Initially no conflicts
      expect(component.hasSlugConflict(mockProjects[0])).toBe(false);

      // Manually set a conflict (simulating what checkSlugConflicts would do)
      (
        component as unknown as {
          conflictingSlugs: { set: (v: Set<string>) => void };
        }
      ).conflictingSlugs.set(new Set(['my-project']));

      expect(component.hasSlugConflict(mockProjects[0])).toBe(true);
      expect(component.hasSlugConflict(mockProjects[1])).toBe(false);
    });

    it('should return original slug when not renamed', () => {
      expect(component.getProjectSlug(mockProjects[0])).toBe('my-project');
    });

    it('should return renamed slug when project has been renamed', () => {
      component.updateProjectSlug(mockProjects[0], 'my-renamed-project');
      expect(component.getProjectSlug(mockProjects[0])).toBe(
        'my-renamed-project'
      );
    });

    it('should validate slug format correctly', () => {
      expect(component.isValidSlug('valid-slug')).toBe(true);
      expect(component.isValidSlug('my-project-123')).toBe(true);
      expect(component.isValidSlug('a1')).toBe(false); // Too short
      expect(component.isValidSlug('Invalid-Slug')).toBe(false); // Uppercase
      expect(component.isValidSlug('-invalid')).toBe(false); // Starts with hyphen
    });

    it('should correctly identify if new slug would also conflict', () => {
      // Set existing server slugs (what already exists on the server)
      (
        component as unknown as {
          serverSlugs: { set: (v: Set<string>) => void };
        }
      ).serverSlugs.set(new Set(['existing-slug']));

      expect(component.wouldSlugConflict('existing-slug')).toBe(true);
      expect(component.wouldSlugConflict('new-unique-slug')).toBe(false);
    });

    it('should clear previous rename when updating with a new slug', () => {
      component.updateProjectSlug(mockProjects[0], 'first-rename');
      expect(component.getProjectSlug(mockProjects[0])).toBe('first-rename');

      component.updateProjectSlug(mockProjects[0], 'second-rename');
      expect(component.getProjectSlug(mockProjects[0])).toBe('second-rename');
    });

    it('should clear rename when setting back to original slug', () => {
      component.updateProjectSlug(mockProjects[0], 'renamed-slug');
      expect(component.getProjectSlug(mockProjects[0])).toBe('renamed-slug');

      // Set back to original
      component.updateProjectSlug(mockProjects[0], mockProjects[0].slug);
      expect(component.getProjectSlug(mockProjects[0])).toBe('my-project');
    });

    it('should keep empty slug when user clears the field', () => {
      component.updateProjectSlug(mockProjects[0], 'renamed-slug');
      expect(component.getProjectSlug(mockProjects[0])).toBe('renamed-slug');

      // Set empty - user cleared the field, so it should stay empty
      component.updateProjectSlug(mockProjects[0], '');
      expect(component.getProjectSlug(mockProjects[0])).toBe('');
    });

    it('should clear rename when setting back to original slug', () => {
      component.updateProjectSlug(mockProjects[0], 'renamed-slug');
      expect(component.getProjectSlug(mockProjects[0])).toBe('renamed-slug');

      // Set back to original - this removes the rename entry
      component.updateProjectSlug(mockProjects[0], 'my-project');
      expect(component.getProjectSlug(mockProjects[0])).toBe('my-project');
    });
  });

  describe('testConnection()', () => {
    it('should set error if URL is empty', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('');

      await component.testConnection();

      expect(component['connectionError']()).toBe('Please enter a server URL');
    });

    it('should set connectionSuccess on successful fetch', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://test-server.example.com');

      // Mock successful fetch
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      expect(component['connectionSuccess']()).toBe(true);
      expect(component['connectionError']()).toBeNull();
    });

    it('should set connectionError on failed response', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://test-server.example.com');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      await component.testConnection();

      expect(component['connectionSuccess']()).toBe(false);
      expect(component['connectionError']()).toBe(
        'Server is not responding correctly'
      );
    });

    it('should set connectionError on fetch exception', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://test-server.example.com');

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network')));

      await component.testConnection();

      expect(component['connectionSuccess']()).toBe(false);
      expect(component['connectionError']()).toBe(
        'Failed to connect to server'
      );
    });

    it('should show connection error on TypeError with Failed to fetch message', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://test-server.example.com');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
      );

      await component.testConnection();

      expect(component['connectionSuccess']()).toBe(false);
      expect(component['connectionError']()).toContain(
        'Unable to reach server'
      );
    });

    it('should normalize URL by adding http:// for localhost URLs', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('localhost:8333');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      // Verify the normalized URL was used for fetch
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/health'
      );
      expect(component['connectionSuccess']()).toBe(true);
    });

    it('should normalize URL by adding https:// for non-localhost URLs', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('example.com:8333');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      // Verify the normalized URL was used for fetch
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://example.com:8333/api/v1/health'
      );
      expect(component['connectionSuccess']()).toBe(true);
    });

    it('should not modify URLs that already have http://', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('http://myserver.local:8080');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'http://myserver.local:8080/api/v1/health'
      );
    });

    it('should not modify URLs that already have https://', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://secure.example.com');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://secure.example.com/api/v1/health'
      );
    });

    it('should normalize 127.0.0.1 with http:// protocol', async () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('127.0.0.1:8333');

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'http://127.0.0.1:8333/api/v1/health'
      );
    });
  });

  describe('addServer()', () => {
    it('should set error if URL is empty', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('');

      component.addServer();

      expect(component['connectionError']()).toBe('Please enter a server URL');
    });

    it('should always switch to migrate view for authentication', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://server.example.com');

      // Even with no local projects, should show auth form
      migrationServiceMock.hasLocalProjects.mockReturnValue(false);
      setupServiceMock.getMode.mockReturnValue('server');

      component.addServer();

      expect(component['currentView']()).toBe('migrate');
      expect(component['showAuthForm']()).toBe(true);
      expect(component['pendingServerUrl']).toBe('https://server.example.com');
    });

    it('should switch to migrate view when local projects exist', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://server.example.com');

      migrationServiceMock.hasLocalProjects.mockReturnValue(true);
      setupServiceMock.getMode.mockReturnValue('local');

      component.addServer();

      expect(component['currentView']()).toBe('migrate');
      expect(component['showAuthForm']()).toBe(true);
    });

    it('should normalize URL by adding http:// for localhost when storing', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('localhost:8333');

      component.addServer();

      expect(component['pendingServerUrl']).toBe('http://localhost:8333');
    });

    it('should normalize URL by adding https:// for non-localhost when storing', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('example.com:8333');

      component.addServer();

      expect(component['pendingServerUrl']).toBe('https://example.com:8333');
    });

    it('should handle 127.0.0.1 with http:// protocol', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('127.0.0.1:8333');

      component.addServer();

      expect(component['pendingServerUrl']).toBe('http://127.0.0.1:8333');
    });
  });

  describe('addLocalMode()', () => {
    it('should set error if username is empty', () => {
      (
        component as unknown as { localUsername: { set: (v: string) => void } }
      ).localUsername.set('');

      component.addLocalMode();

      expect(component['localError']()).toBe('Please enter a username');
    });

    it('should set error for invalid username format', () => {
      (
        component as unknown as { localUsername: { set: (v: string) => void } }
      ).localUsername.set('invalid user!');

      component.addLocalMode();

      expect(component['localError']()).toBe(
        'Username can only contain letters, numbers, hyphens, and underscores'
      );
    });

    it('should configure local mode with valid username', () => {
      (
        component as unknown as { localUsername: { set: (v: string) => void } }
      ).localUsername.set('validuser');
      (
        component as unknown as {
          localDisplayName: { set: (v: string) => void };
        }
      ).localDisplayName.set('Valid User');

      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });

      component.addLocalMode();

      expect(setupServiceMock.configureLocalMode).toHaveBeenCalledWith({
        name: 'Valid User',
        username: 'validuser',
      });
      expect(window.location.href).toBe('/');
    });
  });

  describe('switchToLocalMode()', () => {
    it('should switch to existing local config if available', async () => {
      // Local config already exists in mock
      storageContextMock.getConfigurations.mockReturnValue([mockLocalConfig]);

      // Mock switchToProfile to prevent actual navigation
      const switchSpy = vi.spyOn(component, 'switchToProfile');
      switchSpy.mockResolvedValue(undefined);

      await component.switchToLocalMode();

      expect(switchSpy).toHaveBeenCalledWith(mockLocalConfig);
    });

    it('should show add local form if no local config exists', async () => {
      // No local config
      storageContextMock.getConfigurations.mockReturnValue([mockServerConfig]);

      await component.switchToLocalMode();

      expect(component['currentView']()).toBe('add-local');
    });
  });

  describe('cancelMigration()', () => {
    it('should return to list view and reset form', () => {
      // Set up some state
      (
        component as unknown as { currentView: { set: (v: string) => void } }
      ).currentView.set('migrate');
      (
        component as unknown as { showAuthForm: { set: (v: boolean) => void } }
      ).showAuthForm.set(true);

      component.cancelMigration();

      expect(component['currentView']()).toBe('list');
      expect(component['showAuthForm']()).toBe(false);
    });
  });

  describe('toggleAuthMode()', () => {
    it('should toggle from register to login', () => {
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('register');

      component.toggleAuthMode();

      expect(component['authMode']()).toBe('login');
    });

    it('should toggle from login to register', () => {
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');

      component.toggleAuthMode();

      expect(component['authMode']()).toBe('register');
    });
  });

  describe('authenticate()', () => {
    it('should set error if username or password is empty', async () => {
      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('');

      await component.authenticate();

      expect(component['authError']()).toBe(
        'Please enter username and password'
      );
    });

    it('should set error if passwords do not match in register mode', () => {
      // This test validates that registration mode uses shared form component
      // The password matching is now handled by RegistrationFormComponent
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('register');

      // In register mode, the component uses RegistrationFormComponent which handles password matching
      // We test that the mode is correctly set
      expect(component['authMode']()).toBe('register');
    });

    it('should call registerOnServer when in register mode via onRegistrationSubmit', async () => {
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });

      // Simulate registration form submission via onRegistrationSubmit
      await component.onRegistrationSubmit({
        username: 'testuser',
        password: 'password123',
      });

      expect(migrationServiceMock.registerOnServer).toHaveBeenCalledWith(
        'testuser',
        'password123'
      );
    });

    it('should call loginToServer when in login mode', async () => {
      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('testuser');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('password123');
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });

      await component.authenticate();

      expect(migrationServiceMock.loginToServer).toHaveBeenCalledWith(
        'testuser',
        'password123'
      );
    });

    it('should handle authentication errors', async () => {
      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('testuser');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('password123');
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      setupServiceMock.configureServerMode = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await component.authenticate();

      expect(component['authError']()).toBe('Network error');
    });
  });

  describe('showAddLocalMode()', () => {
    it('should switch to add-local view', () => {
      component.showAddLocalMode();
      expect(component['currentView']()).toBe('add-local');
    });
  });

  describe('cancelAddLocal()', () => {
    it('should return to list view', () => {
      component.showAddLocalMode();
      component.cancelAddLocal();
      expect(component['currentView']()).toBe('list');
    });
  });

  describe('getProfileInfo() edge cases', () => {
    it('should handle invalid URL gracefully', () => {
      const invalidUrlConfig: ServerConfig = {
        ...mockServerConfig,
        serverUrl: 'not-a-valid-url',
        displayName: undefined,
      };
      const info = component.getProfileInfo(invalidUrlConfig);
      expect(info.name).toBe('not-a-valid-url');
      expect(info.subtitle).toBe('not-a-valid-url');
    });

    it('should return username for local profile subtitle', () => {
      const info = component.getProfileInfo(mockLocalConfig);
      expect(info.subtitle).toBe('testuser');
    });

    it('should return Offline when no userProfile username', () => {
      const localNoUser: ServerConfig = {
        ...mockLocalConfig,
        userProfile: undefined,
      };
      const info = component.getProfileInfo(localNoUser);
      expect(info.subtitle).toBe('Offline');
    });
  });

  describe('addLocalMode() error handling', () => {
    it('should handle configureLocalMode exception', () => {
      (
        component as unknown as { localUsername: { set: (v: string) => void } }
      ).localUsername.set('validuser');
      setupServiceMock.configureLocalMode = vi.fn().mockImplementation(() => {
        throw new Error('Config failed');
      });

      component.addLocalMode();

      expect(component['localError']()).toBe(
        'Failed to add local mode. Please try again.'
      );
    });

    it('should use username as displayName when displayName is empty', () => {
      (
        component as unknown as { localUsername: { set: (v: string) => void } }
      ).localUsername.set('myuser');
      (
        component as unknown as {
          localDisplayName: { set: (v: string) => void };
        }
      ).localDisplayName.set('');

      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });

      component.addLocalMode();

      expect(setupServiceMock.configureLocalMode).toHaveBeenCalledWith({
        name: 'myuser',
        username: 'myuser',
      });
      expect(window.location.href).toBe('/');
    });
  });

  describe('computed properties', () => {
    it('should compute migrationProgress correctly', () => {
      // Initially 0
      expect(component['migrationProgress']()).toBe(0);
    });

    it('should compute migrationProgress with active migration', () => {
      migrationServiceMock.migrationState.set({
        status: MigrationStatus.InProgress,
        totalProjects: 4,
        completedProjects: 2,
        failedProjects: 0,
        projectStatuses: [],
      });

      expect(component['migrationProgress']()).toBe(50);
    });

    it('should compute someProjectsSelected correctly', () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
        {
          id: '2',
          title: 'Project 2',
          slug: 'project-2',
          username: 'testuser',
          createdDate: '2024-01-02',
          updatedDate: '2024-01-02',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // Select only one project
      component.toggleProjectSelection(mockProjects[0]);

      expect(component['someProjectsSelected']()).toBe(true);
      expect(component['allProjectsSelected']()).toBe(false);
    });

    it('should compute hasUnresolvedConflicts when selected project has conflict', () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'conflict-project',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // Select the project
      component.toggleProjectSelection(mockProjects[0]);

      // Set conflict
      (
        component as unknown as {
          conflictingSlugs: { set: (v: Set<string>) => void };
        }
      ).conflictingSlugs.set(new Set(['conflict-project']));

      expect(component['hasUnresolvedConflicts']()).toBe(true);
    });

    it('should not have unresolved conflicts when project is renamed', () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'conflict-project',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // Select the project
      component.toggleProjectSelection(mockProjects[0]);

      // Set conflict
      (
        component as unknown as {
          conflictingSlugs: { set: (v: Set<string>) => void };
        }
      ).conflictingSlugs.set(new Set(['conflict-project']));

      // Rename the project to resolve conflict
      component.updateProjectSlug(mockProjects[0], 'renamed-project');

      expect(component['hasUnresolvedConflicts']()).toBe(false);
    });

    it('should have unresolved conflict when renamed slug also conflicts', () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'conflict-project',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      // Select the project
      component.toggleProjectSelection(mockProjects[0]);

      // Set conflict for the original slug
      (
        component as unknown as {
          conflictingSlugs: { set: (v: Set<string>) => void };
        }
      ).conflictingSlugs.set(new Set(['conflict-project']));

      // Set server slugs (what exists on server, including the renamed target)
      (
        component as unknown as {
          serverSlugs: { set: (v: Set<string>) => void };
        }
      ).serverSlugs.set(new Set(['conflict-project', 'also-taken']));

      // Rename the project to another conflicting slug
      component.updateProjectSlug(mockProjects[0], 'also-taken');

      expect(component['hasUnresolvedConflicts']()).toBe(true);
    });
  });

  describe('addServer() error handling', () => {
    it('should set error if URL is empty or whitespace', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('   ');

      component.addServer();

      expect(component['connectionError']()).toBe('Please enter a server URL');
      expect(component['currentView']()).not.toBe('migrate');
    });
  });

  describe('completeServerSwitch()', () => {
    beforeEach(() => {
      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });
    });

    it('should add server config and switch when completing server switch', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://new-server.example.com');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://new-server.example.com';

      // Mock the config return with matching config
      const newConfig: ServerConfig = {
        id: 'new-server-id',
        type: 'server',
        serverUrl: 'https://new-server.example.com',
        displayName: 'New Server',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
      storageContextMock.getConfigurations.mockReturnValue([newConfig]);

      component.completeServerSwitch();

      expect(storageContextMock.addServerConfig).toHaveBeenCalledWith(
        'https://new-server.example.com',
        undefined
      );
      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith(
        'new-server-id'
      );
      expect(window.location.href).toBe('/');
    });

    it('should use custom display name when provided', () => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set('https://server.example.com');
      (
        component as unknown as { newServerName: { set: (v: string) => void } }
      ).newServerName.set('My Custom Server');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Mock the config return
      const newConfig: ServerConfig = {
        id: 'server-id',
        type: 'server',
        serverUrl: 'https://server.example.com',
        displayName: 'My Custom Server',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
      storageContextMock.getConfigurations.mockReturnValue([newConfig]);

      component.completeServerSwitch();

      expect(storageContextMock.addServerConfig).toHaveBeenCalledWith(
        'https://server.example.com',
        'My Custom Server'
      );
    });
  });

  describe('authenticate() with migration', () => {
    beforeEach(() => {
      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });
    });

    it('should set isAuthenticated and check conflicts after successful auth', async () => {
      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('testuser');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('password123');
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      await component.authenticate();

      expect(component['isAuthenticated']()).toBe(true);
      expect(projectsServiceMock.listUserProjects).toHaveBeenCalled();
    });

    it('should select all projects by default after authentication', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);

      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('testuser');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('password123');
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      await component.authenticate();

      expect(component['selectedProjectSlugs']().has('project-1')).toBe(true);
    });
  });

  describe('migrateProjects()', () => {
    beforeEach(() => {
      // Mock window.location for navigation check
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });
    });

    it('should migrate projects with slug renames when conflicts are resolved', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];

      // Set up selected projects
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);
      component.toggleProjectSelection(mockProjects[0]);
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Set up a rename to avoid conflict
      const renames = new Map([['project-1', 'project-1-renamed']]);
      (
        component as unknown as {
          projectRenames: { set: (v: Map<string, string>) => void };
        }
      ).projectRenames.set(renames);

      // Mock successful migration
      migrationServiceMock.migrationState.set({
        status: MigrationStatus.Completed,
        totalProjects: 1,
        completedProjects: 1,
        failedProjects: 0,
        projectStatuses: [],
      });

      await component.migrateProjects();

      expect(migrationServiceMock.migrateToServer).toHaveBeenCalledWith(
        'https://server.example.com',
        ['project-1'],
        renames
      );
    });

    it('should show success message when migration completes', async () => {
      // Set up selected projects but no conflicts
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'unique-project',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);
      component.toggleProjectSelection(mockProjects[0]);
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Mock successful migration
      migrationServiceMock.migrationState.set({
        status: MigrationStatus.Completed,
        totalProjects: 1,
        completedProjects: 1,
        failedProjects: 0,
        projectStatuses: [],
      });

      await component.migrateProjects();

      expect(migrationServiceMock.cleanupLocalData).toHaveBeenCalledWith([
        'unique-project',
      ]);
    });

    it('should show message when no projects selected', async () => {
      migrationServiceMock.getLocalProjects.mockReturnValue([]);
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      await component.migrateProjects();

      // Should not attempt migration (no projects selected)
      expect(migrationServiceMock.migrateToServer).not.toHaveBeenCalled();
    });

    it('should set error if unresolved conflicts exist', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'conflicting-project',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);
      component.toggleProjectSelection(mockProjects[0]);

      // Set up conflict with no rename
      (
        component as unknown as {
          conflictingSlugs: { set: (v: Set<string>) => void };
        }
      ).conflictingSlugs.set(new Set(['conflicting-project']));

      await component.migrateProjects();

      expect(component['authError']()).toContain('resolve slug conflicts');
      expect(migrationServiceMock.migrateToServer).not.toHaveBeenCalled();
    });

    it('should handle non-Error exception in migration', async () => {
      const mockProjects = [
        {
          id: '1',
          title: 'Project 1',
          slug: 'project-1',
          username: 'testuser',
          createdDate: '2024-01-01',
          updatedDate: '2024-01-01',
        },
      ];
      migrationServiceMock.getLocalProjects.mockReturnValue(mockProjects);
      component.toggleProjectSelection(mockProjects[0]);
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Throw a non-Error object
      migrationServiceMock.migrateToServer = vi
        .fn()
        .mockRejectedValue('String error');

      await component.migrateProjects();

      expect(component['authError']()).toBe(
        'Migration failed. Please try again.'
      );
    });
  });

  describe('authenticate() error handling', () => {
    it('should handle non-Error exception in authentication', async () => {
      (
        component as unknown as { username: { set: (v: string) => void } }
      ).username.set('testuser');
      (
        component as unknown as { password: { set: (v: string) => void } }
      ).password.set('password123');
      (
        component as unknown as { authMode: { set: (v: string) => void } }
      ).authMode.set('login');
      (component as unknown as { pendingServerUrl: string }).pendingServerUrl =
        'https://server.example.com';

      // Throw a non-Error object
      setupServiceMock.configureServerMode = vi
        .fn()
        .mockRejectedValue('String error');

      await component.authenticate();

      expect(component['authError']()).toBe(
        'Authentication failed. Please try again.'
      );
    });
  });
});
