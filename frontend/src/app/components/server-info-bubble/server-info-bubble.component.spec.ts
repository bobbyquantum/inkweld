import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthTokenService } from '@services/auth/auth-token.service';
import {
  ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { MockedObject, vi } from 'vitest';

import { ServerInfoBubbleComponent } from './server-info-bubble.component';

describe('ServerInfoBubbleComponent', () => {
  let component: ServerInfoBubbleComponent;
  let fixture: ComponentFixture<ServerInfoBubbleComponent>;
  let storageContextMock: MockedObject<StorageContextService>;
  let authTokenServiceMock: MockedObject<AuthTokenService>;

  // Writable signals for dynamic updates in tests
  let configurationsSignal: ReturnType<typeof signal<ServerConfig[]>>;
  let activeConfigSignal: ReturnType<typeof signal<ServerConfig | null>>;
  let isLocalModeSignal: ReturnType<typeof signal<boolean>>;
  let isConfiguredSignal: ReturnType<typeof signal<boolean>>;

  const mockServerConfig: ServerConfig = {
    id: 'abc123',
    type: 'server',
    serverUrl: 'https://my-server.com',
    displayName: 'My Server',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  const mockLocalConfig: ServerConfig = {
    id: 'local',
    type: 'local',
    displayName: 'Local Mode',
    addedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    // Initialize signals before creating the component
    configurationsSignal = signal<ServerConfig[]>([]);
    activeConfigSignal = signal<ServerConfig | null>(null);
    isLocalModeSignal = signal<boolean>(false);
    isConfiguredSignal = signal<boolean>(false);

    storageContextMock = {
      getConfigurations: vi.fn(() => configurationsSignal()),
      getActiveConfig: vi.fn(() => activeConfigSignal()),
      isLocalMode: vi.fn(() => isLocalModeSignal()),
      isConfigured: vi.fn(() => isConfiguredSignal()),
      switchToConfig: vi.fn(),
    } as unknown as MockedObject<StorageContextService>;

    authTokenServiceMock = {
      hasTokenForConfig: vi.fn().mockReturnValue(false),
    } as unknown as MockedObject<AuthTokenService>;

    await TestBed.configureTestingModule({
      imports: [ServerInfoBubbleComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: StorageContextService, useValue: storageContextMock },
        { provide: AuthTokenService, useValue: authTokenServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServerInfoBubbleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('when not configured', () => {
    beforeEach(() => {
      isConfiguredSignal.set(false);
      fixture.detectChanges();
    });

    it('should show disconnected bubble', () => {
      const bubble = fixture.nativeElement.querySelector(
        '[data-testid="server-info-bubble-disconnected"]'
      );
      expect(bubble).toBeTruthy();
    });

    it('should not show profile menu button', () => {
      const menuButton = fixture.nativeElement.querySelector(
        '[data-testid="server-info-bubble"]'
      );
      expect(menuButton).toBeFalsy();
    });
  });

  describe('when configured with single server profile', () => {
    beforeEach(() => {
      configurationsSignal.set([mockServerConfig]);
      activeConfigSignal.set(mockServerConfig);
      isConfiguredSignal.set(true);
      fixture.detectChanges();
    });

    it('should show connected bubble', () => {
      const bubble = fixture.nativeElement.querySelector(
        '[data-testid="server-info-bubble"]'
      );
      expect(bubble).toBeTruthy();
    });

    it('should show cloud icon for server mode', () => {
      expect(component.getStatusIcon()).toBe('cloud_done');
    });

    it('should report no multiple profiles', () => {
      expect(component.hasMultipleProfiles()).toBe(false);
    });

    it('should extract hostname for short display name', () => {
      expect(component.getShortDisplayName()).toBe('my-server.com');
    });
  });

  describe('when configured with multiple profiles', () => {
    beforeEach(() => {
      configurationsSignal.set([mockServerConfig, mockLocalConfig]);
      activeConfigSignal.set(mockServerConfig);
      isConfiguredSignal.set(true);
      fixture.detectChanges();
    });

    it('should report multiple profiles', () => {
      expect(component.hasMultipleProfiles()).toBe(true);
    });

    it('should return correct display name for each profile type', () => {
      expect(component.getProfileDisplayName(mockServerConfig)).toBe(
        'My Server'
      );
      expect(component.getProfileDisplayName(mockLocalConfig)).toBe(
        'Local Mode'
      );
    });

    it('should return correct icon for each profile type', () => {
      expect(component.getProfileIcon(mockServerConfig)).toBe('cloud');
      expect(component.getProfileIcon(mockLocalConfig)).toBe('folder');
    });
  });

  describe('when in local mode', () => {
    beforeEach(() => {
      configurationsSignal.set([mockLocalConfig]);
      activeConfigSignal.set(mockLocalConfig);
      isLocalModeSignal.set(true);
      isConfiguredSignal.set(true);
      fixture.detectChanges();
    });

    it('should show folder icon for local mode', () => {
      expect(component.getStatusIcon()).toBe('folder');
    });

    it('should show "Local" as short display name', () => {
      expect(component.getShortDisplayName()).toBe('Local');
    });
  });

  describe('switchToProfile', () => {
    const config2: ServerConfig = {
      id: 'config2',
      type: 'server',
      serverUrl: 'https://server2.com',
      addedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };

    beforeEach(() => {
      configurationsSignal.set([mockServerConfig, config2]);
      activeConfigSignal.set(mockServerConfig);
      isConfiguredSignal.set(true);
      fixture.detectChanges();
    });

    it('should not switch if already active profile', () => {
      component.switchToProfile(mockServerConfig);
      expect(storageContextMock.switchToConfig).not.toHaveBeenCalled();
    });

    it('should call switchToConfig for different profile', () => {
      // Mock window.location.href to avoid actual navigation
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        value: { href: originalHref },
        writable: true,
      });

      component.switchToProfile(config2);
      expect(storageContextMock.switchToConfig).toHaveBeenCalledWith('config2');
      expect(window.location.href).toBe('/');
    });
  });

  describe('hasTokenForProfile', () => {
    beforeEach(() => {
      configurationsSignal.set([mockServerConfig, mockLocalConfig]);
      activeConfigSignal.set(mockServerConfig);
      isConfiguredSignal.set(true);
      fixture.detectChanges();
    });

    it('should delegate to auth token service', () => {
      authTokenServiceMock.hasTokenForConfig.mockReturnValue(true);
      expect(component.hasTokenForProfile(mockServerConfig)).toBe(true);
      expect(authTokenServiceMock.hasTokenForConfig).toHaveBeenCalledWith(
        'abc123'
      );
    });
  });

  describe('getShortDisplayName edge cases', () => {
    it('should return "Not configured" when no active profile', () => {
      activeConfigSignal.set(null);
      fixture.detectChanges();
      expect(component.getShortDisplayName()).toBe('Not configured');
    });

    it('should use displayName as fallback for invalid URL', () => {
      const configWithBadUrl: ServerConfig = {
        id: 'bad',
        type: 'server',
        serverUrl: 'not-a-valid-url',
        displayName: 'Fallback Name',
        addedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      };
      activeConfigSignal.set(configWithBadUrl);
      fixture.detectChanges();
      expect(component.getShortDisplayName()).toBe('Fallback Name');
    });
  });
});
