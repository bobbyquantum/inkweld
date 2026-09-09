import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfigurationService } from '@inkweld/index';
import { CloudSyncConfigService } from '@services/cloud-sync/cloud-sync-config.service';
import { CloudSyncConnectService } from '@services/cloud-sync/cloud-sync-connect.service';
import { ProfileManagerService } from '@services/core/profile-manager.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SetupService } from '../../services/core/setup.service';
import { UnifiedUserService } from '../../services/user/unified-user.service';
import { SetupComponent } from './setup.component';

describe('SetupComponent', () => {
  let component: SetupComponent;
  let fixture: ComponentFixture<SetupComponent>;
  let mockSetupService: any;
  let mockUnifiedUserService: any;
  let mockConfigurationService: any;
  let mockSnackBar: any;
  let mockRouter: any;
  let mockCloudSyncConfig: any;
  let mockCloudSyncConnect: any;
  let mockActivatedRoute: any;
  let mockProfileManager: any;
  let mockStorageContext: any;

  beforeEach(async () => {
    mockSetupService = {
      isLoading: vi.fn().mockReturnValue(false),
      isConfigured: vi.fn().mockReturnValue(false),
      getServerUrl: vi.fn().mockReturnValue(null),
      configureServerMode: vi.fn().mockResolvedValue(undefined),
      configureLocalMode: vi.fn(),
    };

    mockUnifiedUserService = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigurationService = {
      getAppConfiguration: vi.fn().mockReturnValue(of({})),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    mockCloudSyncConfig = {
      isCloudSyncAvailable: vi.fn().mockReturnValue(false),
      availableProviders: vi.fn().mockReturnValue([]),
    };

    mockCloudSyncConnect = {
      beginAuthorization: vi.fn().mockResolvedValue(undefined),
      connectNextcloud: vi.fn(),
      getPendingConnection: vi.fn().mockReturnValue(null),
      clearPendingConnection: vi.fn(),
      finishNewConnection: vi.fn().mockResolvedValue({ id: 'cloud-dropbox-x' }),
      adoptExistingProfile: vi.fn().mockReturnValue({ id: 'cloud-dropbox-y' }),
    };

    mockActivatedRoute = {
      snapshot: {
        queryParamMap: { get: vi.fn().mockReturnValue(null) },
      },
    };

    mockProfileManager = {
      describe: vi.fn((config: { userProfile?: { name: string } }) => ({
        name: config.userProfile?.name ?? 'Browser',
      })),
      upgradeInto: vi.fn().mockResolvedValue({ projectCount: 2 }),
      disconnect: vi.fn().mockResolvedValue('home'),
    };
    mockStorageContext = {
      listProjectsForContext: vi.fn().mockReturnValue([]),
      getConfigurations: vi.fn().mockReturnValue([]),
      getConfigById: vi.fn((id: string) =>
        id === 'local'
          ? {
              id: 'local',
              type: 'local',
              userProfile: { name: 'Author A', username: 'authora' },
            }
          : undefined
      ),
    };
    sessionStorage.removeItem('inkweld-profile-upgrade-source');

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        SetupComponent,
        FormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatDividerModule,
        MatProgressBarModule,
      ],
      providers: [
        { provide: SetupService, useValue: mockSetupService },
        { provide: UnifiedUserService, useValue: mockUnifiedUserService },
        { provide: ConfigurationService, useValue: mockConfigurationService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: Router, useValue: mockRouter },
        { provide: CloudSyncConfigService, useValue: mockCloudSyncConfig },
        { provide: CloudSyncConnectService, useValue: mockCloudSyncConnect },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: ProfileManagerService, useValue: mockProfileManager },
        { provide: StorageContextService, useValue: mockStorageContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SetupComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should not load system config if no server is configured', () => {
      mockSetupService.getServerUrl.mockReturnValue(null);

      fixture.detectChanges();

      expect(
        mockConfigurationService.getAppConfiguration
      ).not.toHaveBeenCalled();
      expect(component['configLoading']()).toBe(false);
    });

    it('should load system config if server is already configured', async () => {
      mockSetupService.getServerUrl.mockReturnValue(
        'http://configured-server.com'
      );
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'BOTH' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockConfigurationService.getAppConfiguration).toHaveBeenCalled();
      expect(component['configLoading']()).toBe(false);
    });

    it('should set appMode from system config', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'ONLINE' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['appMode']()).toBe('ONLINE');
    });

    it('should auto-select online mode if ONLINE only', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'ONLINE' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['showServerSetup']()).toBe(true);
      expect(component['showLocalSetup']()).toBe(false);
    });

    it('should auto-select local mode if LOCAL only', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'LOCAL' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['showLocalSetup']()).toBe(true);
      expect(component['showServerSetup']()).toBe(false);
    });

    it('should set server URL from defaultServerName', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ defaultServerName: 'http://custom-server.com' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['serverUrl']).toBe('http://custom-server.com');
    });

    it('should handle config load failure gracefully', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      fixture.detectChanges();
      await fixture.whenStable();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load system configuration, using defaults:',
        expect.any(Error)
      );
      expect(component['appMode']()).toBe('BOTH');
      expect(component['configLoading']()).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should ignore invalid appMode values', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'INVALID_MODE' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['appMode']()).toBe('BOTH');
    });

    it('should ignore empty defaultServerName', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      component['serverUrl'] = 'http://original.com';
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ defaultServerName: '   ' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['serverUrl']).toBe('http://original.com');
    });
  });

  describe('mode selection helpers', () => {
    it('shouldShowModeSelection should return true when BOTH mode and no selection', () => {
      component['appMode'].set('BOTH');
      component['showServerSetup'].set(false);
      component['showLocalSetup'].set(false);

      expect(component['shouldShowModeSelection']()).toBe(true);
    });

    it('shouldShowModeSelection should return false when mode selected', () => {
      component['appMode'].set('BOTH');
      component['showServerSetup'].set(true);

      expect(component['shouldShowModeSelection']()).toBe(false);
    });

    it('shouldShowModeSelection should return false when not BOTH mode', () => {
      component['appMode'].set('ONLINE');
      component['showServerSetup'].set(false);
      component['showLocalSetup'].set(false);

      expect(component['shouldShowModeSelection']()).toBe(false);
    });

    it('canUseServerMode should return true for BOTH mode', () => {
      component['appMode'].set('BOTH');
      expect(component['canUseServerMode']()).toBe(true);
    });

    it('canUseServerMode should return true for ONLINE mode', () => {
      component['appMode'].set('ONLINE');
      expect(component['canUseServerMode']()).toBe(true);
    });

    it('canUseServerMode should return false for LOCAL mode', () => {
      component['appMode'].set('LOCAL');
      expect(component['canUseServerMode']()).toBe(false);
    });

    it('canUseLocalMode should return true for BOTH mode', () => {
      component['appMode'].set('BOTH');
      expect(component['canUseLocalMode']()).toBe(true);
    });

    it('canUseLocalMode should return true for LOCAL mode', () => {
      component['appMode'].set('LOCAL');
      expect(component['canUseLocalMode']()).toBe(true);
    });

    it('canUseLocalMode should return false for ONLINE mode', () => {
      component['appMode'].set('ONLINE');
      expect(component['canUseLocalMode']()).toBe(false);
    });
  });

  describe('layout order', () => {
    it('renders Local option before Server option when BOTH', async () => {
      // Arrange: BOTH mode, no selection -> show mode selection
      component['appMode'].set('BOTH');
      component['showServerSetup'].set(false);
      component['showLocalSetup'].set(false);

      // Act
      fixture.detectChanges();
      await fixture.whenStable();

      const container: HTMLElement | null =
        fixture.nativeElement.querySelector('.setup-options');
      expect(container).toBeTruthy();

      const buttons = container!.querySelectorAll('button.option-card');
      // Ensure both options are present when BOTH
      const hasLocal = Array.from(buttons).some(
        b => b.getAttribute('data-testid') === 'local-mode-button'
      );
      const hasServer = Array.from(buttons).some(
        b => b.getAttribute('data-testid') === 'server-mode-button'
      );
      expect(hasLocal).toBe(true);
      expect(hasServer).toBe(true);

      // Assert: first button should be Local
      const firstButton = buttons.item(0);
      expect(firstButton.getAttribute('data-testid')).toBe('local-mode-button');
    });
  });

  describe('mode selection', () => {
    it('chooseServerMode should show server setup', () => {
      component['chooseServerMode']();

      expect(component['showServerSetup']()).toBe(true);
      expect(component['showLocalSetup']()).toBe(false);
    });

    it('chooseLocalMode should show local setup', () => {
      component['chooseLocalMode']();

      expect(component['showLocalSetup']()).toBe(true);
      expect(component['showServerSetup']()).toBe(false);
    });

    it('goBack should hide both setups', () => {
      component['showServerSetup'].set(true);
      component['showLocalSetup'].set(true);

      component['goBack']();

      expect(component['showServerSetup']()).toBe(false);
      expect(component['showLocalSetup']()).toBe(false);
    });

    it('offers a way back into the app once configured', () => {
      mockSetupService.isConfigured.mockReturnValue(true);

      expect(component['canGoBack']()).toBe(true);
      component['goBack']();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('shows no back button on a fresh install', () => {
      expect(component['canGoBack']()).toBe(false);
    });

    it('opens the step named by ?mode', () => {
      mockCloudSyncConfig.isCloudSyncAvailable.mockReturnValue(true);
      mockCloudSyncConfig.availableProviders.mockReturnValue(['nextcloud']);
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) =>
          key === 'mode' ? 'cloud' : key === 'provider' ? 'nextcloud' : null
      );

      fixture.detectChanges();

      expect(component['showCloudSetup']()).toBe(false);
      expect(component['showNextcloudSetup']()).toBe(true);
    });

    it('opens the server step for ?mode=server', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'mode' ? 'server' : null)
      );

      fixture.detectChanges();

      expect(component['showServerSetup']()).toBe(true);
    });
  });

  describe('setupServerMode', () => {
    it('should show error if server URL is empty', async () => {
      component['serverUrl'] = '';

      await component['setupServerMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please enter a server URL',
        'Close',
        { duration: 3000 }
      );
      expect(mockSetupService.configureServerMode).not.toHaveBeenCalled();
    });

    it('should show error if server URL is whitespace', async () => {
      component['serverUrl'] = '   ';

      await component['setupServerMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please enter a server URL',
        'Close',
        { duration: 3000 }
      );
    });

    it('should configure server mode successfully', async () => {
      component['serverUrl'] = 'http://test-server.com';

      await component['setupServerMode']();

      expect(mockSetupService.configureServerMode).toHaveBeenCalledWith(
        'http://test-server.com'
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Server configuration saved!',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should trim server URL before configuring', async () => {
      component['serverUrl'] = '  http://test-server.com  ';

      await component['setupServerMode']();

      expect(mockSetupService.configureServerMode).toHaveBeenCalledWith(
        'http://test-server.com'
      );
    });

    it('should show error if server configuration fails', async () => {
      component['serverUrl'] = 'http://invalid-server.com';
      mockSetupService.configureServerMode.mockRejectedValue(
        new Error('Connection failed')
      );

      await component['setupServerMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to connect to server. Please check the URL and try again.',
        'Close',
        { duration: 5000 }
      );
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('setupLocalMode', () => {
    it('should use default username when username is empty', async () => {
      component['userName'] = '';
      component['displayName'] = 'Test User';

      await component['setupLocalMode']();

      expect(mockSetupService.configureLocalMode).toHaveBeenCalledWith({
        username: 'local',
        name: 'Test User',
      });
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Browser profile ready!',
        'Close',
        { duration: 3000 }
      );
    });

    it('should use default display name when display name is empty', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = '';

      await component['setupLocalMode']();

      expect(mockSetupService.configureLocalMode).toHaveBeenCalledWith({
        username: 'testuser',
        name: 'Local User',
      });
    });

    it('should use defaults when fields are whitespace', async () => {
      component['userName'] = '   ';
      component['displayName'] = '   ';

      await component['setupLocalMode']();

      expect(mockSetupService.configureLocalMode).toHaveBeenCalledWith({
        username: 'local',
        name: 'Local User',
      });
    });

    it('should configure local mode successfully', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = 'Test User';

      await component['setupLocalMode']();

      expect(mockSetupService.configureLocalMode).toHaveBeenCalledWith({
        username: 'testuser',
        name: 'Test User',
      });
      expect(mockUnifiedUserService.initialize).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Browser profile ready!',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should trim username and display name', async () => {
      component['userName'] = '  testuser  ';
      component['displayName'] = '  Test User  ';

      await component['setupLocalMode']();

      expect(mockSetupService.configureLocalMode).toHaveBeenCalledWith({
        username: 'testuser',
        name: 'Test User',
      });
    });

    it('should show error if local configuration fails', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = 'Test User';
      mockSetupService.configureLocalMode.mockImplementation(() => {
        throw new Error('Configuration failed');
      });

      await component['setupLocalMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to configure local mode',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should handle user initialization failure', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = 'Test User';
      mockUnifiedUserService.initialize.mockRejectedValue(
        new Error('Initialization failed')
      );

      await component['setupLocalMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to configure local mode',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
  describe('profile upgrade', () => {
    const pending = {
      provider: 'dropbox' as const,
      accountId: 'dbid:1',
      accountLabel: 'bobby@example.com',
      suggestedName: 'Bobby Quantum',
      suggestedUsername: 'bobby-quantum',
    };

    it('remembers the source from ?upgradeFrom and retitles the screen', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) =>
          key === 'upgradeFrom' ? 'local' : key === 'mode' ? 'cloud' : null
      );

      fixture.detectChanges();

      expect(sessionStorage.getItem('inkweld-profile-upgrade-source')).toBe(
        'local'
      );
      expect(component['upgradeSourceName']()).toBe('Author A');
      expect(component['showCloudSetup']()).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('Connect to sync');
    });

    it('keeps the author name and username when prefilling the profile step', () => {
      sessionStorage.setItem('inkweld-profile-upgrade-source', 'local');
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );
      mockCloudSyncConnect.getPendingConnection.mockReturnValue(pending);

      fixture.detectChanges();

      expect(component['displayName']).toBe('Author A');
      expect(component['userName']).toBe('authora');
    });

    it('copies the source profile into the new cloud profile and reloads', async () => {
      sessionStorage.setItem('inkweld-profile-upgrade-source', 'local');
      const originalLocation = globalThis.location;
      const assign = vi.fn();
      Object.defineProperty(globalThis, 'location', {
        value: { assign },
        writable: true,
        configurable: true,
      });
      component['pendingCloudConnection'].set(pending);
      component['displayName'] = 'Author A';
      component['userName'] = 'authora';

      try {
        await component['setupCloudProfile']();
      } finally {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }

      expect(mockProfileManager.upgradeInto).toHaveBeenCalledWith(
        'local',
        'cloud-dropbox-x',
        'authora',
        []
      );
      expect(
        sessionStorage.getItem('inkweld-profile-upgrade-source')
      ).toBeNull();
      expect(assign).toHaveBeenCalledWith('/');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('continues as an existing author and reloads', async () => {
      const originalLocation = globalThis.location;
      const assign = vi.fn();
      Object.defineProperty(globalThis, 'location', {
        value: { assign },
        writable: true,
        configurable: true,
      });
      component['pendingCloudConnection'].set({
        ...pending,
        existingProfiles: [{ name: 'Bee', username: 'bee', slugs: [] }],
      });

      try {
        await component['continueAsExisting']({ name: 'Bee', username: 'bee' });
      } finally {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }

      expect(mockCloudSyncConnect.adoptExistingProfile).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'dbid:1' }),
        { name: 'Bee', username: 'bee' }
      );
      expect(mockProfileManager.upgradeInto).not.toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith('/');
    });

    it('upgrading into an author that already exists asks to rename clashing projects', async () => {
      sessionStorage.setItem('inkweld-profile-upgrade-source', 'local');
      mockStorageContext.listProjectsForContext.mockReturnValue([
        { username: 'authora', slug: 'novel', title: 'Novel' },
        { username: 'authora', slug: 'fresh', title: 'Fresh' },
      ]);
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );
      mockCloudSyncConnect.getPendingConnection.mockReturnValue({
        ...pending,
        existingProfiles: [
          {
            name: 'Author A',
            username: 'AuthorA',
            slugs: ['novel', 'novel-2'],
          },
        ],
      });

      fixture.detectChanges();

      expect(component['showCloudClash']()).toBe(true);
      expect(component['clashes']()).toEqual([
        { slug: 'novel', title: 'Novel', newSlug: 'novel-3' },
      ]);
      expect(component['clashesResolved']()).toBe(true);

      component['setClashSlug']('novel', 'novel-2');
      expect(component['clashesResolved']()).toBe(false);
      component['setClashSlug']('novel', 'my-novel');
      expect(component['clashesResolved']()).toBe(true);

      const originalLocation = globalThis.location;
      const assign = vi.fn();
      Object.defineProperty(globalThis, 'location', {
        value: { assign },
        writable: true,
        configurable: true,
      });
      try {
        await component['confirmClashes']();
      } finally {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }

      expect(mockCloudSyncConnect.adoptExistingProfile).toHaveBeenCalledWith(
        expect.anything(),
        { name: 'Author A', username: 'AuthorA' }
      );
      expect(mockProfileManager.upgradeInto).toHaveBeenCalledWith(
        'local',
        'cloud-dropbox-y',
        'AuthorA',
        [{ oldSlug: 'novel', newSlug: 'my-novel' }]
      );
      expect(assign).toHaveBeenCalledWith('/');
    });

    it('upgrading into an account without this author goes to the profile form', () => {
      sessionStorage.setItem('inkweld-profile-upgrade-source', 'local');
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );
      mockCloudSyncConnect.getPendingConnection.mockReturnValue({
        ...pending,
        existingProfiles: [{ name: 'Bee', username: 'bee', slugs: [] }],
      });

      fixture.detectChanges();

      expect(component['showCloudProfileSetup']()).toBe(true);
      expect(component['showCloudChooseProfile']()).toBe(false);
      expect(component['userName']).toBe('authora');
    });

    it('a plain add into an account with authors shows the chooser', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );
      mockCloudSyncConnect.getPendingConnection.mockReturnValue({
        ...pending,
        existingProfiles: [{ name: 'Bee', username: 'bee', slugs: [] }],
      });

      fixture.detectChanges();

      expect(component['showCloudChooseProfile']()).toBe(true);
      component['addNewCloudProfile']();
      expect(component['showCloudChooseProfile']()).toBe(false);
      expect(component['showCloudProfileSetup']()).toBe(true);
      expect(component['userName']).toBe('bobby-quantum');
    });

    it('abandoning the welcome screen forgets the pending upgrade', () => {
      sessionStorage.setItem('inkweld-profile-upgrade-source', 'local');
      mockSetupService.isConfigured.mockReturnValue(true);

      component['goBack']();

      expect(
        sessionStorage.getItem('inkweld-profile-upgrade-source')
      ).toBeNull();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });
  });

  describe('cloud sync', () => {
    const pending = {
      provider: 'dropbox' as const,
      accountId: 'dbid:1',
      accountLabel: 'bobby@example.com',
      suggestedName: 'Bobby Quantum',
      suggestedUsername: 'bobby-quantum',
    };

    function enableDropbox(): void {
      mockCloudSyncConfig.isCloudSyncAvailable.mockReturnValue(true);
      mockCloudSyncConfig.availableProviders.mockReturnValue(['dropbox']);
    }

    it('hides the cloud option when no provider is configured', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['canUseCloudMode']()).toBe(false);
      expect(
        fixture.nativeElement.querySelector('[data-testid="cloud-mode-button"]')
      ).toBeNull();
    });

    it('renders Browser, Cloud Sync, Realtime in that order when available', async () => {
      enableDropbox();
      fixture.detectChanges();
      await fixture.whenStable();

      const ids = Array.from(
        fixture.nativeElement.querySelectorAll(
          '.setup-options button.option-card'
        ) as NodeListOf<HTMLElement>
      ).map(b => b.getAttribute('data-testid'));
      expect(ids).toEqual([
        'local-mode-button',
        'cloud-mode-button',
        'server-mode-button',
      ]);
    });

    it('still offers a choice on a LOCAL-only server when cloud sync exists', async () => {
      enableDropbox();
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'LOCAL' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['showLocalSetup']()).toBe(false);
      expect(component['shouldShowModeSelection']()).toBe(true);
      expect(component['canUseServerMode']()).toBe(false);
    });

    it('shows the provider picker even when only one provider is available', async () => {
      enableDropbox();

      component['chooseCloudMode']();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['showCloudSetup']()).toBe(true);
      expect(mockCloudSyncConnect.beginAuthorization).not.toHaveBeenCalled();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="cloud-provider-dropbox"]'
        )
      ).not.toBeNull();
    });

    it('shows the provider picker when several providers are available', () => {
      mockCloudSyncConfig.isCloudSyncAvailable.mockReturnValue(true);
      mockCloudSyncConfig.availableProviders.mockReturnValue([
        'dropbox',
        'google-drive',
      ]);

      component['chooseCloudMode']();

      expect(component['showCloudSetup']()).toBe(true);
      expect(mockCloudSyncConnect.beginAuthorization).not.toHaveBeenCalled();
      expect(component['cloudProviders']().map(p => p.id)).toEqual([
        'dropbox',
        'google-drive',
      ]);
    });

    it('reports an error and re-enables the UI when authorization cannot start', async () => {
      enableDropbox();
      mockCloudSyncConnect.beginAuthorization.mockRejectedValue(
        new Error('Dropbox is not configured for this build')
      );

      await component['connectCloudProvider']('dropbox');

      expect(component['isConnectingCloud']()).toBe(false);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Dropbox is not configured for this build',
        'Close',
        expect.anything()
      );
    });

    describe('nextcloud', () => {
      const ncPending = {
        provider: 'nextcloud' as const,
        accountId: 'https://cloud.example.com#bob',
        accountLabel: 'bob on cloud.example.com',
        suggestedName: 'bob',
        suggestedUsername: 'bob',
      };

      function enableNextcloud(): void {
        mockCloudSyncConfig.isCloudSyncAvailable.mockReturnValue(true);
        mockCloudSyncConfig.availableProviders.mockReturnValue([
          'dropbox',
          'nextcloud',
        ]);
      }

      it('opens the address form instead of redirecting', async () => {
        enableNextcloud();
        component['chooseCloudMode']();

        await component['connectCloudProvider']('nextcloud');
        fixture.detectChanges();
        await fixture.whenStable();

        expect(mockCloudSyncConnect.beginAuthorization).not.toHaveBeenCalled();
        expect(component['showNextcloudSetup']()).toBe(true);
        expect(component['showCloudSetup']()).toBe(false);
        expect(component['canGoBack']()).toBe(true);
        const form = fixture.nativeElement.querySelector(
          '[data-testid="nextcloud-form"]'
        );
        expect(form).not.toBeNull();
        expect(
          fixture.nativeElement
            .querySelector('[data-testid="nextcloud-guide-link"]')
            .getAttribute('href')
        ).toContain('/user-guide/getting-started/nextcloud-sync');
        expect(
          fixture.nativeElement.querySelector(
            '[data-testid="connect-nextcloud-button"]'
          ).disabled
        ).toBe(true);
      });

      it('goes back to the provider list from the address form', () => {
        enableNextcloud();
        component['showNextcloudSetup'].set(true);

        component['goBack']();

        expect(component['showNextcloudSetup']()).toBe(false);
        expect(component['showCloudSetup']()).toBe(true);
      });

      it('offers the existing authors when the folder already has a manifest', async () => {
        mockCloudSyncConnect.connectNextcloud.mockResolvedValue({
          kind: 'choose-profile',
          pending: {
            ...ncPending,
            existingProfiles: [{ name: 'Bob', username: 'bob', slugs: ['a'] }],
          },
        });
        component['nextcloudUrl'] = 'cloud.example.com';
        component['nextcloudUser'] = 'bob';
        component['nextcloudAppPassword'] = 'pw';

        await component['connectNextcloud']();
        fixture.detectChanges();

        expect(component['showCloudChooseProfile']()).toBe(true);
        expect(component['showCloudProfileSetup']()).toBe(false);
        expect(mockRouter.navigate).not.toHaveBeenCalled();
        expect(component['nextcloudAppPassword']).toBe('');
        expect(
          fixture.nativeElement.querySelector(
            '[data-testid="cloud-continue-bob"]'
          )
        ).not.toBeNull();
        expect(
          fixture.nativeElement.querySelector(
            '[data-testid="cloud-add-new-profile"]'
          )
        ).not.toBeNull();
      });

      it('moves to the profile step for an empty folder', async () => {
        mockCloudSyncConnect.connectNextcloud.mockResolvedValue({
          kind: 'needs-profile',
          pending: ncPending,
        });
        component['showNextcloudSetup'].set(true);
        component['nextcloudUrl'] = 'https://cloud.example.com';
        component['nextcloudUser'] = 'bob';
        component['nextcloudAppPassword'] = 'pw';

        await component['connectNextcloud']();

        expect(component['showNextcloudSetup']()).toBe(false);
        expect(component['showCloudProfileSetup']()).toBe(true);
        expect(component['pendingCloudConnection']()).toEqual(ncPending);
        expect(component['displayName']).toBe('bob');
        expect(component['userName']).toBe('bob');
        expect(component['pendingProviderName']()).toBe('Nextcloud');
        expect(mockRouter.navigate).not.toHaveBeenCalled();
      });

      it('shows the connect error and stays on the form', async () => {
        mockCloudSyncConnect.connectNextcloud.mockRejectedValue(
          new Error('Could not reach cloud.example.com.')
        );
        component['showNextcloudSetup'].set(true);
        component['nextcloudUrl'] = 'https://cloud.example.com';
        component['nextcloudUser'] = 'bob';
        component['nextcloudAppPassword'] = 'pw';

        await component['connectNextcloud']();

        expect(mockSnackBar.open).toHaveBeenCalledWith(
          'Could not reach cloud.example.com.',
          'Close',
          expect.anything()
        );
        expect(component['showNextcloudSetup']()).toBe(true);
        expect(component['isConnectingCloud']()).toBe(false);
      });
    });

    it('opens the profile step when returning from the provider', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );
      mockCloudSyncConnect.getPendingConnection.mockReturnValue(pending);

      fixture.detectChanges();

      expect(component['showCloudProfileSetup']()).toBe(true);
      expect(component['shouldShowModeSelection']()).toBe(false);
      expect(component['displayName']).toBe('Bobby Quantum');
      expect(component['userName']).toBe('bobby-quantum');
      expect(component['pendingProviderName']()).toBe('Dropbox');
      expect(
        mockConfigurationService.getAppConfiguration
      ).not.toHaveBeenCalled();
    });

    it('ignores a stale ?cloud param when no connection is pending', () => {
      mockActivatedRoute.snapshot.queryParamMap.get.mockImplementation(
        (key: string) => (key === 'cloud' ? 'dropbox' : null)
      );

      fixture.detectChanges();

      expect(component['showCloudProfileSetup']()).toBe(false);
      expect(component['configLoading']()).toBe(false);
    });

    it('finishes the connection with the entered profile', async () => {
      component['pendingCloudConnection'].set(pending);
      component['showCloudProfileSetup'].set(true);
      component['displayName'] = '  Bobby  ';
      component['userName'] = ' bobby ';

      await component['setupCloudProfile']();

      expect(mockCloudSyncConnect.finishNewConnection).toHaveBeenCalledWith(
        pending,
        { username: 'bobby', name: 'Bobby' }
      );
      expect(mockUnifiedUserService.initialize).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        replaceUrl: true,
      });
      expect(component['isConnectingCloud']()).toBe(false);
    });

    it('falls back to the suggested profile when fields are blank', async () => {
      component['pendingCloudConnection'].set(pending);
      component['displayName'] = '';
      component['userName'] = '';

      await component['setupCloudProfile']();

      expect(mockCloudSyncConnect.finishNewConnection).toHaveBeenCalledWith(
        pending,
        { username: 'bobby-quantum', name: 'Bobby Quantum' }
      );
    });

    it('shows an error and stays on the step when finishing fails', async () => {
      component['pendingCloudConnection'].set(pending);
      component['showCloudProfileSetup'].set(true);
      mockCloudSyncConnect.finishNewConnection.mockRejectedValue(
        new Error('boom')
      );

      await component['setupCloudProfile']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to set up Dropbox sync. Please try again.',
        'Close',
        expect.anything()
      );
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(component['showCloudProfileSetup']()).toBe(true);
    });

    it('returns to the mode picker when the pending connection has expired', async () => {
      component['pendingCloudConnection'].set(null);
      component['showCloudProfileSetup'].set(true);

      await component['setupCloudProfile']();

      expect(mockCloudSyncConnect.finishNewConnection).not.toHaveBeenCalled();
      expect(component['showCloudProfileSetup']()).toBe(false);
      expect(mockSnackBar.open).toHaveBeenCalled();
    });

    it('goBack from the profile step abandons the pending connection', () => {
      component['pendingCloudConnection'].set(pending);
      component['showCloudProfileSetup'].set(true);

      component['goBack']();

      expect(mockCloudSyncConnect.clearPendingConnection).toHaveBeenCalled();
      expect(component['pendingCloudConnection']()).toBeNull();
      expect(component['showCloudProfileSetup']()).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith([], {
        replaceUrl: true,
        queryParams: {},
      });
    });
  });
});
