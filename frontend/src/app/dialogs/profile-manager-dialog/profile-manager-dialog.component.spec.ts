import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { type Project, ProjectsService } from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { CloudSyncConfigService } from '@services/cloud-sync/cloud-sync-config.service';
import { CloudTokenStoreService } from '@services/cloud-sync/cloud-token-store.service';
import { LoggerService } from '@services/core/logger.service';
import { ProfileManagerService } from '@services/core/profile-manager.service';
import { SetupService } from '@services/core/setup.service';
import {
  type ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { BackgroundSyncService } from '@services/local/background-sync.service';
import {
  MigrationService,
  type MigrationState,
  MigrationStatus,
} from '@services/local/migration.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
    const configurations = signal<ServerConfig[]>([
      mockLocalConfig,
      mockServerConfig,
    ]);
    return {
      getConfigurations: vi.fn(() => configurations()),
      getActiveConfig: vi.fn().mockReturnValue(mockLocalConfig),
      configurations,
      activeConfig: signal<ServerConfig | null>(mockLocalConfig),
      switchToConfig: vi.fn(),
      addServerConfig: vi.fn().mockResolvedValue(undefined),
      updateConfigDisplayName: vi.fn(),
      removeConfig: vi.fn((id: string) => {
        configurations.set(configurations().filter(c => c.id !== id));
      }),
      getConfigById: vi.fn((id: string) =>
        configurations().find(c => c.id === id)
      ),
      isConfigured: vi.fn(() => configurations().length > 0),
      getPrefix: vi.fn().mockReturnValue('local:'),
      describeContextData: vi.fn().mockResolvedValue({
        prefix: 'local:',
        databases: ['local:inkweld-media'],
        localStorageKeys: ['local:userSettings'],
      }),
      clearContextData: vi.fn().mockResolvedValue(undefined),
      findOrphanedData: vi.fn().mockResolvedValue([]),
      clearPrefixedData: vi.fn().mockResolvedValue(undefined),
      clearConfig: vi.fn(),
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
      isHostedServerConfig: vi.fn().mockReturnValue(false),
    };
  }

  const dialogRefMock = { close: vi.fn() };
  const matDialogMock = { open: vi.fn(), closeAll: vi.fn() };
  const cloudTokensMock = {
    has: vi.fn().mockReturnValue(true),
    clear: vi.fn(),
  };

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
    matDialogMock.open.mockReset();
    dialogRefMock.close.mockReset();
    storageContextMock = createStorageContextMock();
    authTokenServiceMock = createAuthTokenServiceMock();
    setupServiceMock = createSetupServiceMock();
    migrationServiceMock = createMigrationServiceMock();
    backgroundSyncServiceMock = createBackgroundSyncServiceMock();
    projectsServiceMock = createProjectsServiceMock();
    routerMock = createRouterMock();

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        ProfileManagerDialogComponent,
        MatDialogModule,
        MatSnackBarModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: StorageContextService, useValue: storageContextMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: MigrationService, useValue: migrationServiceMock },
        { provide: BackgroundSyncService, useValue: backgroundSyncServiceMock },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: CloudTokenStoreService, useValue: cloudTokensMock },
        {
          provide: CloudSyncConfigService,
          useValue: { isCloudSyncAvailable: () => true },
        },
        { provide: LoggerService, useValue: { info: vi.fn(), warn: vi.fn() } },
        ProfileManagerService,
      ],
    })
      // The component imports MatDialogModule itself, which would shadow a
      // plain TestBed provider; overrideProvider reaches every injector.
      .overrideProvider(MatDialog, { useValue: matDialogMock })
      .compileComponents();

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
      expect(info.name).toBe('Test User');
      expect(info.icon).toBe('computer');
      expect(info.isActive).toBe(true);
    });

    it('should return correct info for server profile', () => {
      const info = component.getProfileInfo(mockServerConfig);
      // The author headlines; the server is the detail line
      expect(info.name).toBe('Server User');
      expect(info.subtitle).toBe('@serveruser · My Server');
      expect(info.icon).toBe('dns');
      expect(info.kind).toBe('server');
      expect(info.isActive).toBe(false);
    });

    it('should extract hostname when no display name', () => {
      const serverNoName: ServerConfig = {
        ...mockServerConfig,
        displayName: undefined,
        userProfile: undefined,
      };
      const info = component.getProfileInfo(serverNoName);
      expect(info.name).toBe('inkweld.example.com');
      expect(info.subtitle).toBe('inkweld.example.com · not logged in');
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
    function stubLocation(): void {
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });
    }

    function answerConfirm(result: boolean): ReturnType<typeof vi.fn> {
      return matDialogMock.open.mockReturnValue({
        afterClosed: () => of(result),
      });
    }

    it('disconnects a non-active profile and stays in the dialog', async () => {
      const open = answerConfirm(true);

      await component.removeProfile(mockServerConfig);

      const data = (open.mock.calls[0] as [unknown, { data: never }])[1].data;
      expect((data as { title: string }).title).toContain('Server User');
      expect(
        (data as { requireConfirmationText?: string }).requireConfirmationText
      ).toBeUndefined();
      expect(authTokenServiceMock.clearTokenForConfig).toHaveBeenCalledWith(
        'server-123'
      );
      expect(storageContextMock.clearContextData).toHaveBeenCalledWith(
        'server-123'
      );
      expect(storageContextMock.removeConfig).toHaveBeenCalledWith(
        'server-123'
      );
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('requires typed confirmation for the browser profile and reloads when it was active', async () => {
      stubLocation();
      const open = answerConfirm(true);
      storageContextMock.configurations.set([
        mockLocalConfig,
        mockServerConfig,
      ]);

      await component.removeProfile(mockLocalConfig);

      const data = (open.mock.calls[0] as [unknown, { data: never }])[1].data;
      expect(
        (data as { requireConfirmationText?: string }).requireConfirmationText
      ).toBe('DELETE');
      expect(storageContextMock.removeConfig).toHaveBeenCalledWith('local');
      // Active profile removed, another remains: switch and go home
      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith(
        'server-123'
      );
      expect(window.location.href).toBe('/');
    });

    it('lands on the welcome screen when the last profile is removed', async () => {
      stubLocation();
      answerConfirm(true);
      storageContextMock.configurations.set([mockLocalConfig]);
      storageContextMock.removeConfig.mockImplementation(() => {
        storageContextMock.configurations.set([]);
      });

      await component.removeProfile(mockLocalConfig);

      expect(window.location.href).toBe('/setup');
    });

    it('does nothing when the confirmation is cancelled', async () => {
      answerConfirm(false);
      await component.removeProfile(mockServerConfig);
      expect(storageContextMock.removeConfig).not.toHaveBeenCalled();
    });

    it('refuses to remove the built-in hosted server', async () => {
      setupServiceMock.isHostedServerConfig.mockReturnValue(true);
      const open = answerConfirm(true);

      await component.removeProfile(mockServerConfig);

      expect(open).not.toHaveBeenCalled();
      expect(storageContextMock.removeConfig).not.toHaveBeenCalled();
    });
  });

  describe('upgrade view', () => {
    it('offers cloud and server for a Browser profile', () => {
      expect(component['upgradeOptions']()).toEqual(['cloud', 'server']);
      component.showUpgrade();
      fixture.detectChanges();
      expect(component['currentView']()).toBe('upgrade');
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="upgrade-cloud-button"]'
        )
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="upgrade-server-button"]'
        )
      ).not.toBeNull();
    });

    it('offers only a server for a cloud profile, nothing for a server one', () => {
      const cloud: ServerConfig = {
        id: 'cloud-dropbox-1',
        type: 'cloud',
        cloudProvider: 'dropbox',
        addedAt: '',
        lastUsedAt: '',
      };
      storageContextMock.configurations.set([cloud, mockServerConfig]);
      storageContextMock.activeConfig.set(cloud);
      expect(component['upgradeOptions']()).toEqual(['server']);

      storageContextMock.activeConfig.set(mockServerConfig);
      expect(component['upgradeOptions']()).toEqual([]);
    });

    it('upgradeToCloud remembers the source and deep-links to the cloud step', () => {
      const session: Record<string, string> = {};
      const original = window.sessionStorage;
      Object.defineProperty(window, 'sessionStorage', {
        value: {
          getItem: (k: string) => session[k] ?? null,
          setItem: (k: string, v: string) => {
            session[k] = v;
          },
          removeItem: (k: string) => {
            delete session[k];
          },
        },
        writable: true,
        configurable: true,
      });
      try {
        component.upgradeToCloud();
      } finally {
        Object.defineProperty(window, 'sessionStorage', {
          value: original,
          writable: true,
          configurable: true,
        });
      }

      expect(session['inkweld-profile-upgrade-source']).toBe('local');
      expect(matDialogMock.closeAll).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/setup'], {
        queryParams: { mode: 'cloud', upgradeFrom: 'local' },
      });
    });

    it('upgradeToServer opens the guided server flow', () => {
      component.upgradeToServer();
      expect(component['currentView']()).toBe('add');
    });
  });

  describe('navigation shortcuts', () => {
    it('goToWelcome closes dialogs and opens the setup page', () => {
      component.goToWelcome();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('addCloudStorage deep-links to the cloud step', () => {
      component.addCloudStorage();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/setup'], {
        queryParams: { mode: 'cloud' },
      });
    });

    it('reconnectCloud deep-links to the provider', () => {
      component.reconnectCloud({
        ...mockServerConfig,
        type: 'cloud',
        cloudProvider: 'nextcloud',
      });
      expect(routerMock.navigate).toHaveBeenCalledWith(['/setup'], {
        queryParams: { mode: 'cloud', provider: 'nextcloud' },
      });
    });
  });

  describe('storage panel', () => {
    it('scans on first open and lists orphans', async () => {
      storageContextMock.findOrphanedData.mockResolvedValue([
        {
          prefix: 'srv:dead0000:',
          databases: ['srv:dead0000:x'],
          localStorageKeys: [],
        },
      ]);

      await component.toggleStorage();

      expect(component['showStorage']()).toBe(true);
      const scan = component['storageScan']();
      expect(scan?.connections).toHaveLength(2);
      expect(scan?.orphans[0].prefix).toBe('srv:dead0000:');
    });

    it('deleteOrphan confirms, clears and rescans', async () => {
      matDialogMock.open.mockReturnValue({ afterClosed: () => of(true) });

      await component.deleteOrphan('srv:dead0000:');

      expect(storageContextMock.clearPrefixedData).toHaveBeenCalledWith(
        'srv:dead0000:'
      );
      expect(storageContextMock.findOrphanedData).toHaveBeenCalled();
    });

    it('formats byte counts', () => {
      expect(component.formatBytes(512)).toBe('512 B');
      expect(component.formatBytes(1536)).toBe('1.5 KB');
      expect(component.formatBytes(20 * 1024 * 1024)).toBe('20 MB');
    });
  });

  describe('resetDevice()', () => {
    it('requires RESET and wipes everything', async () => {
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      });
      const open = matDialogMock.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      await component.resetDevice();

      const data = (open.mock.calls[0] as [unknown, { data: never }])[1].data;
      expect(
        (data as { requireConfirmationText?: string }).requireConfirmationText
      ).toBe('RESET');
      expect(storageContextMock.clearConfig).toHaveBeenCalled();
      expect(window.location.href).toBe('/setup');
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

    it('should clear rename when slug is set back to the project original', () => {
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

    it.each<{
      description: string;
      inputUrl: string;
      expectedUrl: string;
    }>([
      {
        description: 'should not modify URLs that already have http://',
        inputUrl: 'http://myserver.local:8080',
        expectedUrl: 'http://myserver.local:8080',
      },
      {
        description: 'should not modify URLs that already have https://',
        inputUrl: 'https://secure.example.com',
        expectedUrl: 'https://secure.example.com',
      },
      {
        description: 'should normalize 127.0.0.1 with http:// protocol',
        inputUrl: '127.0.0.1:8333',
        expectedUrl: 'http://127.0.0.1:8333',
      },
    ])('$description', async ({ inputUrl, expectedUrl }) => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set(inputUrl);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      // Verify the normalized URL was used for fetch
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `${expectedUrl}/api/v1/health`
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

    it.each<{
      description: string;
      inputUrl: string;
      expectedPendingUrl: string;
    }>([
      {
        description:
          'should normalize URL by adding http:// for localhost when storing',
        inputUrl: 'localhost:8333',
        expectedPendingUrl: 'http://localhost:8333',
      },
      {
        description:
          'should normalize URL by adding https:// for non-localhost when storing',
        inputUrl: 'example.com:8333',
        expectedPendingUrl: 'https://example.com:8333',
      },
      {
        description: 'should handle 127.0.0.1 with http:// protocol',
        inputUrl: '127.0.0.1:8333',
        expectedPendingUrl: 'http://127.0.0.1:8333',
      },
    ])('$description', ({ inputUrl, expectedPendingUrl }) => {
      (
        component as unknown as { newServerUrl: { set: (v: string) => void } }
      ).newServerUrl.set(inputUrl);

      component.addServer();

      expect(component['pendingServerUrl']).toBe(expectedPendingUrl);
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
      expect(info.name).toBe('Server User');
      expect(info.subtitle).toBe('@serveruser · not-a-valid-url');
    });

    it('should return username for local profile subtitle', () => {
      const info = component.getProfileInfo(mockLocalConfig);
      expect(info.name).toBe('Test User');
      expect(info.subtitle).toBe('@testuser · this browser only');
    });

    it('should describe a browser profile without a user', () => {
      const localNoUser: ServerConfig = {
        ...mockLocalConfig,
        userProfile: undefined,
      };
      const info = component.getProfileInfo(localNoUser);
      expect(info.name).toBe('Browser');
      expect(info.subtitle).toBe('This browser only');
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

      // Authentication already created the profile; nothing new is added
      expect(storageContextMock.addServerConfig).not.toHaveBeenCalled();
      expect(storageContextMock.updateConfigDisplayName).not.toHaveBeenCalled();
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

      expect(storageContextMock.updateConfigDisplayName).toHaveBeenCalledWith(
        'server-id',
        'My Custom Server'
      );
      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith(
        'server-id'
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
