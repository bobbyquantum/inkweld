import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { User } from '@inkweld/index';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { ThemeOption, ThemeService } from '@themes/theme.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let httpClientMock: MockedObject<HttpClient>;
  let routerMock: MockedObject<Router>;
  let userServiceMock: MockedObject<UnifiedUserService>;
  let dialogGatewayMock: MockedObject<DialogGatewayService>;
  let setupServiceMock: MockedObject<SetupService>;
  let themeServiceMock: MockedObject<ThemeService>;
  const activatedRouteMock = {
    params: of({ username: 'testuser' }),
  };

  const mockUser = {
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(async () => {
    httpClientMock = {
      get: vi.fn(),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as MockedObject<HttpClient>;

    routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    userServiceMock = {
      logout: vi.fn().mockResolvedValue(undefined),
      getMode: vi.fn().mockReturnValue('offline'),
      currentUser: signal(mockUser),
    } as unknown as MockedObject<UnifiedUserService>;

    dialogGatewayMock = {
      openUserSettingsDialog: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<DialogGatewayService>;

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

    await TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
        { provide: DialogGatewayService, useValue: dialogGatewayMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: ThemeService, useValue: themeServiceMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
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
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

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
    it('should return online status when in server mode', () => {
      setupServiceMock.getMode.mockReturnValue('server');
      const status = component.getConnectionStatus();
      expect(status.text).toBe('Online');
      expect(status.cssClass).toBe('online');
      expect(status.icon).toBe('cloud_done');
    });

    it('should return offline status when in offline mode', () => {
      setupServiceMock.getMode.mockReturnValue('offline');
      const status = component.getConnectionStatus();
      expect(status.text).toBe('Offline');
      expect(status.cssClass).toBe('offline');
      expect(status.icon).toBe('cloud_off');
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
});
