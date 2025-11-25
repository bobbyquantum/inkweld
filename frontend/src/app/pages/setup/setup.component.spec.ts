import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { ConfigurationService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  beforeEach(async () => {
    mockSetupService = {
      isLoading: vi.fn().mockReturnValue(false),
      getServerUrl: vi.fn().mockReturnValue(null),
      configureServerMode: vi.fn().mockResolvedValue(undefined),
      configureOfflineMode: vi.fn(),
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

    await TestBed.configureTestingModule({
      imports: [
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
        provideAnimations(),
        { provide: SetupService, useValue: mockSetupService },
        { provide: UnifiedUserService, useValue: mockUnifiedUserService },
        { provide: ConfigurationService, useValue: mockConfigurationService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: Router, useValue: mockRouter },
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
      expect(component['showOfflineSetup']()).toBe(false);
    });

    it('should auto-select offline mode if OFFLINE only', async () => {
      mockSetupService.getServerUrl.mockReturnValue('http://server.com');
      mockConfigurationService.getAppConfiguration.mockReturnValue(
        of({ appMode: 'OFFLINE' })
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component['showOfflineSetup']()).toBe(true);
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
      component['showOfflineSetup'].set(false);

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
      component['showOfflineSetup'].set(false);

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

    it('canUseServerMode should return false for OFFLINE mode', () => {
      component['appMode'].set('OFFLINE');
      expect(component['canUseServerMode']()).toBe(false);
    });

    it('canUseOfflineMode should return true for BOTH mode', () => {
      component['appMode'].set('BOTH');
      expect(component['canUseOfflineMode']()).toBe(true);
    });

    it('canUseOfflineMode should return true for OFFLINE mode', () => {
      component['appMode'].set('OFFLINE');
      expect(component['canUseOfflineMode']()).toBe(true);
    });

    it('canUseOfflineMode should return false for ONLINE mode', () => {
      component['appMode'].set('ONLINE');
      expect(component['canUseOfflineMode']()).toBe(false);
    });
  });

  describe('mode selection', () => {
    it('chooseServerMode should show server setup', () => {
      component['chooseServerMode']();

      expect(component['showServerSetup']()).toBe(true);
      expect(component['showOfflineSetup']()).toBe(false);
    });

    it('chooseOfflineMode should show offline setup', () => {
      component['chooseOfflineMode']();

      expect(component['showOfflineSetup']()).toBe(true);
      expect(component['showServerSetup']()).toBe(false);
    });

    it('goBack should hide both setups', () => {
      component['showServerSetup'].set(true);
      component['showOfflineSetup'].set(true);

      component['goBack']();

      expect(component['showServerSetup']()).toBe(false);
      expect(component['showOfflineSetup']()).toBe(false);
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
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/welcome']);
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

  describe('setupOfflineMode', () => {
    it('should show error if username is empty', async () => {
      component['userName'] = '';
      component['displayName'] = 'Test User';

      await component['setupOfflineMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please fill in all fields',
        'Close',
        { duration: 3000 }
      );
      expect(mockSetupService.configureOfflineMode).not.toHaveBeenCalled();
    });

    it('should show error if display name is empty', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = '';

      await component['setupOfflineMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please fill in all fields',
        'Close',
        { duration: 3000 }
      );
    });

    it('should show error if fields are whitespace', async () => {
      component['userName'] = '   ';
      component['displayName'] = '   ';

      await component['setupOfflineMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please fill in all fields',
        'Close',
        { duration: 3000 }
      );
    });

    it('should configure offline mode successfully', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = 'Test User';

      await component['setupOfflineMode']();

      expect(mockSetupService.configureOfflineMode).toHaveBeenCalledWith({
        username: 'testuser',
        name: 'Test User',
      });
      expect(mockUnifiedUserService.initialize).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Offline mode configured!',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should trim username and display name', async () => {
      component['userName'] = '  testuser  ';
      component['displayName'] = '  Test User  ';

      await component['setupOfflineMode']();

      expect(mockSetupService.configureOfflineMode).toHaveBeenCalledWith({
        username: 'testuser',
        name: 'Test User',
      });
    });

    it('should show error if offline configuration fails', async () => {
      component['userName'] = 'testuser';
      component['displayName'] = 'Test User';
      mockSetupService.configureOfflineMode.mockImplementation(() => {
        throw new Error('Configuration failed');
      });

      await component['setupOfflineMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to configure offline mode',
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

      await component['setupOfflineMode']();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to configure offline mode',
        'Close',
        { duration: 3000 }
      );
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});
