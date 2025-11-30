import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SetupService } from '@services/core/setup.service';
import {
  MigrationService,
  MigrationStatus,
} from '@services/offline/migration.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { ConnectionSettingsComponent } from './connection-settings.component';

describe('ConnectionSettingsComponent', () => {
  let component: ConnectionSettingsComponent;
  let fixture: ComponentFixture<ConnectionSettingsComponent>;
  let setupService: MockedObject<SetupService>;
  let migrationService: MockedObject<MigrationService>;
  let dialog: MockedObject<MatDialog>;
  let router: MockedObject<Router>;
  let snackBar: MockedObject<MatSnackBar>;

  // Mock window.location.reload globally to prevent unhandled errors from setTimeout
  const originalLocation = window.location;
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(async () => {
    setupService = {
      getMode: vi.fn().mockReturnValue('offline'),
      getServerUrl: vi.fn().mockReturnValue(null),
      resetConfiguration: vi.fn(),
      configureServerMode: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<SetupService>;

    migrationService = {
      hasOfflineProjects: vi.fn().mockReturnValue(false),
      getOfflineProjectsCount: vi.fn().mockReturnValue(0),
      migrationState: vi.fn(() => ({
        status: MigrationStatus.NotStarted,
        totalProjects: 0,
        completedProjects: 0,
        failedProjects: 0,
        projectStatuses: [],
      })),
      registerOnServer: vi.fn().mockResolvedValue(undefined),
      loginToServer: vi.fn().mockResolvedValue(undefined),
      migrateToServer: vi.fn().mockResolvedValue(undefined),
      cleanupOfflineData: vi.fn(),
    } as unknown as MockedObject<MigrationService>;

    dialog = {
      open: vi.fn(),
    } as unknown as MockedObject<MatDialog>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [ConnectionSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: SetupService, useValue: setupService },
        { provide: MigrationService, useValue: migrationService },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConnectionSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display offline mode', () => {
    expect(component['currentMode']).toBe('offline');
  });

  describe('switchToServerMode', () => {
    it('should show error when server URL is empty', async () => {
      component['newServerUrl'] = '';
      await component.switchToServerMode();
      expect(component['connectionError']()).toBe('Please enter a server URL');
    });

    it('should show error when server URL is whitespace only', async () => {
      component['newServerUrl'] = '   ';
      await component.switchToServerMode();
      expect(component['connectionError']()).toBe('Please enter a server URL');
    });
  });

  describe('testConnection', () => {
    it('should show error when server URL is empty', async () => {
      component['newServerUrl'] = '';
      await component.testConnection();
      expect(component['connectionError']()).toBe('Please enter a server URL');
    });

    it('should show success when connection succeeds', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await component.testConnection();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Connection successful!',
        'Close',
        { duration: 3000 }
      );
      vi.unstubAllGlobals();
    });

    it('should show error when server responds with error', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      await component.testConnection();

      expect(component['connectionError']()).toBe(
        'Server is not responding correctly'
      );
      vi.unstubAllGlobals();
    });

    it('should show error when fetch fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component['newServerUrl'] = 'http://localhost:8333';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error'))
      );

      await component.testConnection();

      expect(component['connectionError']()).toBe(
        'Failed to connect to server'
      );
      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe('cancelMigration', () => {
    it('should hide auth form and reset form fields', () => {
      component['showAuthForm'].set(true);
      component['username'].set('testuser');
      component['password'].set('password');
      component['confirmPassword'].set('password');
      component['authError'].set('Some error');

      component.cancelMigration();

      expect(component['showAuthForm']()).toBe(false);
      expect(component['username']()).toBe('');
      expect(component['password']()).toBe('');
      expect(component['confirmPassword']()).toBe('');
      expect(component['authError']()).toBeNull();
    });
  });

  describe('toggleAuthMode', () => {
    it('should toggle from login to register', () => {
      component['authMode'].set('login');
      component['authError'].set('Some error');

      component.toggleAuthMode();

      expect(component['authMode']()).toBe('register');
      expect(component['authError']()).toBeNull();
    });

    it('should toggle from register to login', () => {
      component['authMode'].set('register');
      component.toggleAuthMode();
      expect(component['authMode']()).toBe('login');
    });
  });

  describe('authenticate', () => {
    it('should show error when username is empty', async () => {
      component['username'].set('');
      component['password'].set('password');

      await component.authenticate();

      expect(component['authError']()).toBe(
        'Please enter username and password'
      );
    });

    it('should show error when password is empty', async () => {
      component['username'].set('testuser');
      component['password'].set('');

      await component.authenticate();

      expect(component['authError']()).toBe(
        'Please enter username and password'
      );
    });

    it('should show error when passwords do not match in register mode', async () => {
      component['authMode'].set('register');
      component['username'].set('testuser');
      component['password'].set('password1');
      component['confirmPassword'].set('password2');

      await component.authenticate();

      expect(component['authError']()).toBe('Passwords do not match');
    });

    it('should call registerOnServer when in register mode', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      component['authMode'].set('register');
      component['username'].set('testuser');
      component['password'].set('password');
      component['confirmPassword'].set('password');

      // Mock completed migration
      migrationService.migrationState.mockReturnValue({
        status: MigrationStatus.Completed,
        totalProjects: 1,
        completedProjects: 1,
        failedProjects: 0,
        projectStatuses: [],
      });

      await component.authenticate();

      expect(setupService.configureServerMode).toHaveBeenCalledWith(
        'http://localhost:8333'
      );
      expect(migrationService.registerOnServer).toHaveBeenCalledWith(
        'testuser',
        'password'
      );
      expect(migrationService.migrateToServer).toHaveBeenCalledWith(
        'http://localhost:8333'
      );
      expect(component['showAuthForm']()).toBe(false);
      expect(snackBar.open).toHaveBeenCalled();
    });

    it('should call loginToServer when in login mode', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      component['authMode'].set('login');
      component['username'].set('testuser');
      component['password'].set('password');

      // Mock completed migration
      migrationService.migrationState.mockReturnValue({
        status: MigrationStatus.Completed,
        totalProjects: 1,
        completedProjects: 1,
        failedProjects: 0,
        projectStatuses: [],
      });

      await component.authenticate();

      expect(migrationService.loginToServer).toHaveBeenCalledWith(
        'testuser',
        'password'
      );
    });

    it('should show failure message when migration has failed projects', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      component['authMode'].set('login');
      component['username'].set('testuser');
      component['password'].set('password');

      // Mock failed migration
      migrationService.migrationState.mockReturnValue({
        status: MigrationStatus.Failed,
        totalProjects: 2,
        completedProjects: 1,
        failedProjects: 1,
        projectStatuses: [],
      });

      await component.authenticate();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Migration completed with errors. 1 succeeded, 1 failed.',
        'Close',
        { duration: 7000 }
      );
    });

    it('should handle authentication errors gracefully', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component['newServerUrl'] = 'http://localhost:8333';
      component['authMode'].set('login');
      component['username'].set('testuser');
      component['password'].set('password');

      migrationService.loginToServer.mockRejectedValue(
        new Error('Auth failed')
      );

      await component.authenticate();

      expect(component['authError']()).toBe('Auth failed');
      expect(component['isAuthenticating']()).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should show generic error message for non-Error exceptions', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component['newServerUrl'] = 'http://localhost:8333';
      component['authMode'].set('login');
      component['username'].set('testuser');
      component['password'].set('password');

      migrationService.loginToServer.mockRejectedValue('Unknown error');

      await component.authenticate();

      expect(component['authError']()).toBe(
        'Authentication failed. Please try again.'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('safety guards', () => {
    it('should show confirmation dialog when switching from server to offline mode', async () => {
      // Setup: component in server mode
      component['currentMode'] = 'server';

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.switchToOfflineMode();

      // Wait for all promises to resolve
      await fixture.whenStable();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.resetConfiguration).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('should not switch modes if user cancels confirmation', async () => {
      // Setup: component in server mode
      component['currentMode'] = 'server';

      // Mock dialog to return cancelled
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(false),
      } as any);

      await component.switchToOfflineMode();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.resetConfiguration).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should handle error when switch to offline mode fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component['currentMode'] = 'server';

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      setupService.resetConfiguration.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      await component.switchToOfflineMode();
      await fixture.whenStable();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to switch modes',
        'Close',
        { duration: 3000 }
      );
      consoleSpy.mockRestore();
    });

    it('should handle error when switch to server mode fails', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      component['newServerUrl'] = 'http://localhost:8333';

      setupService.configureServerMode.mockRejectedValue(
        new Error('Config failed')
      );

      await component.switchToServerMode();

      expect(component['connectionError']()).toBe(
        'Failed to connect to server. Please check the URL and try again.'
      );
      expect(component['isConnecting']()).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should show confirmation when migrating offline projects', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      migrationService.hasOfflineProjects.mockReturnValue(true);
      migrationService.getOfflineProjectsCount.mockReturnValue(2);

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      // Should show auth form after confirmation
      expect(component['showAuthForm']()).toBe(true);
    });

    it('should not start migration if user cancels', async () => {
      component['newServerUrl'] = 'http://localhost:8333';
      migrationService.hasOfflineProjects.mockReturnValue(true);
      migrationService.getOfflineProjectsCount.mockReturnValue(2);

      // Mock dialog to return cancelled
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(false),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      // Should NOT show auth form if cancelled
      expect(component['showAuthForm']()).toBe(false);
    });

    it('should show confirmation when changing servers in server mode', async () => {
      component['currentMode'] = 'server';
      component['newServerUrl'] = 'http://different-server:8333';
      migrationService.hasOfflineProjects.mockReturnValue(false);

      // Mock dialog to return confirmed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      dialog.open.mockReturnValue({
        afterClosed: () => of(true),
      } as any);

      await component.startMigration();

      expect(dialog.open).toHaveBeenCalled();
      expect(setupService.configureServerMode).toHaveBeenCalled();
    });
  });

  it('should switch to offline mode without confirmation in offline mode', async () => {
    // Already in offline mode - no confirmation needed
    component['currentMode'] = 'offline';

    await component.switchToOfflineMode();

    // Wait for all promises to resolve
    await fixture.whenStable();

    expect(dialog.open).not.toHaveBeenCalled();
    expect(setupService.resetConfiguration).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/setup']);
  });

  describe('startMigration', () => {
    it('should show error when server URL is empty', async () => {
      component['newServerUrl'] = '';
      await component.startMigration();
      expect(component['connectionError']()).toBe('Please enter a server URL');
    });
  });

  describe('changeServer', () => {
    it('should call switchToServerMode', async () => {
      const spy = vi.spyOn(component, 'switchToServerMode');
      await component.changeServer();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('migrationProgress', () => {
    it('should return 0 when no projects', () => {
      migrationService.migrationState.mockReturnValue({
        status: MigrationStatus.NotStarted,
        totalProjects: 0,
        completedProjects: 0,
        failedProjects: 0,
        projectStatuses: [],
      });

      // Need to recreate component to pick up new mock
      fixture.detectChanges();

      expect(component['migrationProgress']()).toBe(0);
    });
  });
});
