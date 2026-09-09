import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { type User } from '@inkweld/index';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { CloudSyncEngineService } from '@services/cloud-sync/cloud-sync-engine.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import {
  type ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { TutorialService } from '@services/core/tutorial.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { type ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let httpClientMock: MockedObject<HttpClient>;
  let routerMock: MockedObject<Router>;
  let tutorialServiceMock: { start: ReturnType<typeof vi.fn> };
  let userServiceMock: MockedObject<UnifiedUserService>;
  let dialogGatewayMock: MockedObject<DialogGatewayService>;
  let cloudSyncMock: {
    status: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    syncNow: ReturnType<typeof vi.fn>;
  };
  let setupServiceMock: MockedObject<SetupService>;
  let themeServiceMock: MockedObject<ThemeService>;
  let storageContextMock: MockedObject<StorageContextService>;
  let authTokenServiceMock: MockedObject<AuthTokenService>;

  // Writable signals for dynamic updates in tests
  let configurationsSignal: ReturnType<typeof signal<ServerConfig[]>>;
  let activeConfigSignal: ReturnType<typeof signal<ServerConfig | null>>;

  const activatedRouteMock = {
    params: of({ username: 'testuser' }),
  };

  const mockUser = {
    username: 'testuser',
    name: 'Test User',
  };

  const mockLocalConfig: ServerConfig = {
    id: 'local',
    type: 'local',
    displayName: 'Local Mode',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    userProfile: { name: 'Test User', username: 'testuser' },
  };

  const mockServerConfig: ServerConfig = {
    id: 'abc12345',
    type: 'server',
    serverUrl: 'https://inkweld.example.com',
    displayName: 'My Server',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    userProfile: { name: 'Server User', username: 'serveruser' },
  };

  beforeEach(async () => {
    // Create writable signals for mocks
    configurationsSignal = signal<ServerConfig[]>([mockLocalConfig]);
    activeConfigSignal = signal<ServerConfig | null>(mockLocalConfig);

    httpClientMock = {
      get: vi.fn(),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as MockedObject<HttpClient>;

    routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    tutorialServiceMock = { start: vi.fn().mockReturnValue(true) };

    userServiceMock = {
      logout: vi.fn().mockResolvedValue(undefined),
      getMode: vi.fn().mockReturnValue('local'),
      currentUser: signal(mockUser),
    } as unknown as MockedObject<UnifiedUserService>;

    dialogGatewayMock = {
      openUserSettingsDialog: vi.fn().mockResolvedValue(undefined),
      openProfileManagerDialog: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<DialogGatewayService>;

    cloudSyncMock = {
      status: vi.fn().mockReturnValue('disabled'),
      initialize: vi.fn(),
      syncNow: vi.fn().mockResolvedValue(undefined),
    };

    setupServiceMock = {
      getMode: vi.fn().mockReturnValue('server'),
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    } as unknown as MockedObject<SetupService>;

    themeServiceMock = {
      update: vi.fn(),
      getCurrentTheme: vi
        .fn()
        .mockReturnValue(of('light-theme' as ThemeOption)),
    } as unknown as MockedObject<ThemeService>;

    storageContextMock = {
      configurations: configurationsSignal,
      activeConfig: activeConfigSignal,
      switchToConfig: vi.fn(),
      getPrefix: vi.fn().mockReturnValue('local:'),
      getPrefixForConfig: vi.fn().mockImplementation((id: string) => {
        return id === 'local' ? 'local:' : `srv:${id}:`;
      }),
    } as unknown as MockedObject<StorageContextService>;

    authTokenServiceMock = {
      hasTokenForConfig: vi.fn().mockReturnValue(true),
      getTokenForConfig: vi.fn().mockReturnValue('mock-token'),
      clearTokenForConfig: vi.fn(),
    } as unknown as MockedObject<AuthTokenService>;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), UserMenuComponent],
      providers: [
        { provide: CloudSyncEngineService, useValue: cloudSyncMock },
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
        { provide: TutorialService, useValue: tutorialServiceMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
        { provide: StorageContextService, useValue: storageContextMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
        // Mock UserService to prevent IndexedDB initialization in constructor
        {
          provide: UserService,
          useValue: {
            currentUser: signal(mockUser),
            isLoading: signal(false),
            isAuthenticated: signal(true),
            initialized: signal(true),
            error: signal(undefined),
          },
        },
        // Mock AnnouncementService to prevent API calls
        {
          provide: AnnouncementService,
          useValue: {
            unreadCount: signal(0),
            announcements: signal([]),
            isLoading: signal(false),
            loadUnreadCount: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  /**
   * Re-create the fixture with a specific app mode. Changing the mode after
   * the fixture has rendered triggers ExpressionChangedAfterItHasBeenChecked
   * because the template reads getConnectionStatus() (a method call), so we
   * set the mode before the first change detection pass.
   */
  const createFixtureWithMode = (mode: 'server' | 'local') => {
    fixture?.destroy();
    setupServiceMock.getMode.mockReturnValue(mode);
    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onLogout()', () => {
    it('should handle logout error', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      userServiceMock.logout.mockRejectedValue(new Error('Failed'));

      await component.onLogout();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Logout failed',
        expect.any(Error)
      );
    });
  });

  describe('onSettings()', () => {
    it('should open user settings dialog', async () => {
      await component.onSettings();
      expect(dialogGatewayMock.openUserSettingsDialog).toHaveBeenCalled();
    });
  });

  describe('onManageProfiles()', () => {
    it('should open profile manager dialog', async () => {
      await component.onManageProfiles();
      expect(dialogGatewayMock.openProfileManagerDialog).toHaveBeenCalled();
    });
  });

  describe('onAddConnection()', () => {
    it('opens the welcome screen without disconnecting anything', () => {
      component.onAddConnection();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/setup']);
      expect(storageContextMock.switchToConfig).not.toHaveBeenCalled();
    });
  });

  describe('onThemeChange()', () => {
    it('should update theme to light-theme', () => {
      component.onThemeChange('light-theme');
      expect(themeServiceMock.update).toHaveBeenCalledWith('light-theme');
    });

    it('should update theme to dark-theme', () => {
      component.onThemeChange('dark-theme');
      expect(themeServiceMock.update).toHaveBeenCalledWith('dark-theme');
    });

    it('should update theme to system', () => {
      component.onThemeChange('system');
      expect(themeServiceMock.update).toHaveBeenCalledWith('system');
    });
  });

  describe('user input', () => {
    it('should update when user input changes', () => {
      const mockUser: User = {
        username: 'testuser',
        name: 'Test User',
        id: '1',
        enabled: true,
      };

      component.user = mockUser;
      fixture.detectChanges();

      expect(component.user).toEqual(mockUser);
    });
  });

  describe('getConnectionStatus()', () => {
    it('should return connected status when in server mode', () => {
      setupServiceMock.getMode.mockReturnValue('server');
      const status = component.getConnectionStatus();
      expect(status.text).toBe('Connected');
      expect(status.cssClass).toBe('online');
      expect(status.icon).toBe('cloud_done');
    });

    it('should return local mode status when in local mode', () => {
      setupServiceMock.getMode.mockReturnValue('local');
      const status = component.getConnectionStatus();
      expect(status.text).toBe('Browser · this device only');
      expect(status.cssClass).toBe('local');
      expect(status.icon).toBe('computer');
    });
  });

  describe('cloud sync status', () => {
    it.each([
      ['syncing', 'Syncing…', 'cloud_sync'],
      ['synced', 'Cloud Sync · up to date', 'cloud_done'],
      ['offline', 'Cloud Sync · offline', 'cloud_off'],
      ['error', 'Cloud Sync · error', 'cloud_alert'],
      ['disconnected', 'Cloud Sync · reconnect needed', 'cloud_off'],
      ['idle', 'Cloud Sync', 'cloud_sync'],
    ])('maps engine status %s to the menu line', (status, text, icon) => {
      setupServiceMock.getMode.mockReturnValue('cloud');
      cloudSyncMock.status.mockReturnValue(status);

      const result = component.getConnectionStatus();

      expect(result.text).toBe(text);
      expect(result.icon).toBe(icon);
    });

    it('onSyncNow triggers a full pass', () => {
      component.onSyncNow();
      expect(cloudSyncMock.syncNow).toHaveBeenCalled();
    });

    it('names a cloud profile by its display name', () => {
      const profile = {
        id: 'cloud-dropbox-x',
        type: 'cloud',
        cloudProvider: 'dropbox',
        cloudAccountLabel: 'bobby@example.com',
        displayName: 'Dropbox',
        addedAt: '',
        lastUsedAt: '',
      } as never;
      const info = component.getProfileDisplay(profile);
      expect(info.name).toBe('Dropbox');
      expect(info.subtitle).toBe('Dropbox · bobby@example.com');
      expect(info.icon).toBe('cloud_sync');
      // No stored provider credentials in this spec: needs a reconnect
      expect(info.hasAuth).toBe(false);
      expect(info.kind).toBe('Cloud Sync');
    });
  });

  describe('getCurrentServerName()', () => {
    it('should return "Not configured" when no profile', () => {
      activeConfigSignal.set(null);
      const name = component.getCurrentServerName();
      expect(name).toBe('Not configured');
    });

    it('should return "Browser" for a local profile, even one saved as Local Mode', () => {
      activeConfigSignal.set(mockLocalConfig);
      const name = component.getCurrentServerName();
      expect(name).toBe('Browser');
    });

    it('should return display name for server profile', () => {
      activeConfigSignal.set(mockServerConfig);
      const name = component.getCurrentServerName();
      expect(name).toBe('My Server');
    });

    it('should extract hostname when no display name', () => {
      const serverConfigNoName: ServerConfig = {
        ...mockServerConfig,
        displayName: undefined,
      };
      activeConfigSignal.set(serverConfigNoName);
      const name = component.getCurrentServerName();
      expect(name).toBe('inkweld.example.com');
    });

    it('should return "Server" when URL is invalid', () => {
      const serverConfigInvalidUrl: ServerConfig = {
        ...mockServerConfig,
        displayName: undefined,
        serverUrl: 'not-a-valid-url',
      };
      activeConfigSignal.set(serverConfigInvalidUrl);
      const name = component.getCurrentServerName();
      expect(name).toBe('Server');
    });
  });

  describe('template', () => {
    it('should have an About menu link when menu is open', async () => {
      // Open the menu first
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      // The menu content is rendered in an overlay, check the document
      const aboutLink = document.querySelector(
        '[data-testid="about-menu-link"]'
      );
      expect(aboutLink).toBeTruthy();
      expect(aboutLink?.textContent).toContain('About');
    });
  });

  describe('profile switching', () => {
    it('should always show switch server button in menu', async () => {
      // Open the menu first
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      const switchButton = document.querySelector(
        '[data-testid="switch-server-button"]'
      );
      expect(switchButton).toBeTruthy();
    });

    it('flips into the account switcher without closing the menu', async () => {
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        document.querySelector('[data-testid="profile-switcher"]')
      ).toBeNull();

      const toggle = document.querySelector(
        '[data-testid="switch-server-button"]'
      ) as HTMLElement;
      toggle.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['switcherOpen']()).toBe(true);
      expect(
        document.querySelector('[data-testid="profile-switcher"]')
      ).toBeTruthy();
      expect(
        document.querySelector('[data-testid="profile-local"]')
      ).toBeTruthy();
      expect(
        document.querySelector('[data-testid="add-profile-button"]')
      ).toBeTruthy();
      expect(
        document.querySelector('[data-testid="manage-profiles-button"]')
      ).toBeTruthy();
      // Regular actions are hidden while switching
      expect(
        document.querySelector('[data-testid="about-menu-link"]')
      ).toBeNull();
    });

    it('goes back from the switcher to the actions', async () => {
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      component['switcherOpen'].set(true);
      fixture.detectChanges();

      (
        document.querySelector(
          '[data-testid="switcher-back-button"]'
        ) as HTMLElement
      ).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['switcherOpen']()).toBe(false);
      expect(
        document.querySelector('[data-testid="about-menu-link"]')
      ).toBeTruthy();
    });

    it('opens the profiles manager from the switcher', async () => {
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();
      component['switcherOpen'].set(true);
      fixture.detectChanges();

      (
        document.querySelector(
          '[data-testid="manage-profiles-button"]'
        ) as HTMLElement
      ).click();
      await fixture.whenStable();

      expect(dialogGatewayMock.openProfileManagerDialog).toHaveBeenCalledWith();
    });

    it('offers an upgrade for Browser and cloud profiles only', async () => {
      expect(component['canUpgrade']()).toBe(true);

      await component.onUpgradeProfile();
      expect(dialogGatewayMock.openProfileManagerDialog).toHaveBeenCalledWith({
        view: 'upgrade',
      });

      activeConfigSignal.set(mockServerConfig);
      expect(component['canUpgrade']()).toBe(false);
    });

    it('shows the status line and the upgrade item for a Browser profile', async () => {
      createFixtureWithMode('local');
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="user-menu-button"]'
      );
      menuButton?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        document.querySelector('[data-testid="connection-status-line"]')
          ?.textContent
      ).toContain('Browser · this device only');
      expect(
        document.querySelector('[data-testid="upgrade-profile-menu-item"]')
      ).toBeTruthy();
    });

    it('should get correct profile display for local mode', () => {
      const display = component.getProfileDisplay(mockLocalConfig);
      expect(display.name).toBe('Test User');
      expect(display.subtitle).toBe('@testuser · this browser');
      expect(display.icon).toBe('computer');
      expect(display.isActive).toBe(true);
      expect(display.hasAuth).toBe(true);
    });

    it('should get correct profile display for server mode', () => {
      const display = component.getProfileDisplay(mockServerConfig);
      expect(display.name).toBe('Server User');
      expect(display.subtitle).toBe('@serveruser · My Server');
      expect(display.icon).toBe('dns');
      expect(display.isActive).toBe(false);
    });

    it('should not switch to same profile', () => {
      component.onSwitchProfile(mockLocalConfig);
      expect(storageContextMock.switchToConfig).not.toHaveBeenCalled();
    });

    it('should switch to different profile', () => {
      // Mock window.location.href to avoid actual navigation
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        value: { href: originalHref },
        writable: true,
      });

      component.onSwitchProfile(mockServerConfig);
      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith(
        'abc12345'
      );
      expect(window.location.href).toBe('/');
    });
  });
  describe('onStartTutorial', () => {
    it('starts the configured tour', () => {
      component.tutorialTour = 'home';

      component.onStartTutorial();

      expect(tutorialServiceMock.start).toHaveBeenCalledWith('home');
    });

    it('does nothing when no tour is configured', () => {
      component.tutorialTour = null;

      component.onStartTutorial();

      expect(tutorialServiceMock.start).not.toHaveBeenCalled();
    });
  });
});
