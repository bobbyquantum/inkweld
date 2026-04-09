import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SetupService } from '@services/core/setup.service';
import { vi } from 'vitest';

import { AdminGithubSettingsComponent } from './github-settings.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('AdminGithubSettingsComponent', () => {
  let component: AdminGithubSettingsComponent;
  let fixture: ComponentFixture<AdminGithubSettingsComponent>;
  let mockConfigService: {
    getConfig: ReturnType<typeof vi.fn>;
    setConfig: ReturnType<typeof vi.fn>;
  };
  let mockSetupService: { getServerUrl: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockConfigService = {
      getConfig: vi.fn().mockResolvedValue(null),
      setConfig: vi.fn().mockResolvedValue(undefined),
    };
    mockSetupService = {
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    };
    mockSnackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AdminGithubSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AdminConfigService, useValue: mockConfigService },
        { provide: SetupService, useValue: mockSetupService },
      ],
    })
      .overrideComponent(AdminGithubSettingsComponent, {
        add: {
          providers: [{ provide: MatSnackBar, useValue: mockSnackBar }],
        },
      })
      .compileComponents();
  });

  function createComponent(): ComponentFixture<AdminGithubSettingsComponent> {
    fixture = TestBed.createComponent(AdminGithubSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture;
  }

  /** Create component and wait for ngOnInit loadConfig to complete */
  async function createAndInit(
    configs?: Record<string, { value: string } | null>
  ): Promise<ComponentFixture<AdminGithubSettingsComponent>> {
    if (configs) {
      mockConfigService.getConfig = vi.fn((key: string) =>
        Promise.resolve(configs[key] ?? null)
      );
    }
    createComponent();
    await flushPromises();
    fixture.detectChanges();
    return fixture;
  }

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  describe('loadConfig', () => {
    it('should show loading state initially', () => {
      createComponent();
      expect(component.isLoading()).toBe(true);
    });

    it('should load and display config values', async () => {
      await createAndInit({
        GITHUB_ENABLED: { value: 'true' },
        GITHUB_CLIENT_ID: { value: 'my-client-id' },
        GITHUB_CLIENT_SECRET: { value: '****' },
        GITHUB_CALLBACK_URL: { value: 'https://example.com/callback' },
      });

      expect(component.isLoading()).toBe(false);
      expect(component.githubEnabled()).toBe(true);
      expect(component.clientId()).toBe('my-client-id');
      expect(component.callbackUrl()).toBe('https://example.com/callback');
      expect(component.clientSecret()).toBe(''); // Always cleared after load
      expect(component.isConfigured()).toBe(true);
    });

    it('should set isConfigured to false when client ID is missing', async () => {
      await createAndInit({
        GITHUB_ENABLED: { value: 'false' },
        GITHUB_CLIENT_ID: null,
        GITHUB_CLIENT_SECRET: { value: '****' },
        GITHUB_CALLBACK_URL: null,
      });

      expect(component.isConfigured()).toBe(false);
    });

    it('should set isConfigured to false when client secret is missing', async () => {
      await createAndInit({
        GITHUB_ENABLED: { value: 'false' },
        GITHUB_CLIENT_ID: { value: 'my-id' },
        GITHUB_CLIENT_SECRET: null,
        GITHUB_CALLBACK_URL: null,
      });

      expect(component.isConfigured()).toBe(false);
    });

    it('should handle config load errors', async () => {
      mockConfigService.getConfig.mockRejectedValue(
        new Error('Config fetch failed')
      );

      createComponent();
      await flushPromises();

      expect(component.error()).toBeTruthy();
      expect(component.error()?.message).toBe('Config fetch failed');
    });
  });

  describe('defaultCallbackUrl', () => {
    it('should return URL based on server URL', () => {
      createComponent();
      expect(component.defaultCallbackUrl).toBe(
        'http://localhost:8333/api/v1/auth/github'
      );
    });

    it('should fall back to window.location.origin', () => {
      mockSetupService.getServerUrl.mockReturnValue(null);
      createComponent();
      expect(component.defaultCallbackUrl).toContain('/api/v1/auth/github');
    });
  });

  describe('toggleGithubEnabled', () => {
    it('should prevent enabling without credentials', async () => {
      await createAndInit();

      await component.toggleGithubEnabled(true);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Configure GitHub credentials first',
        'Close',
        { duration: 3000 }
      );
      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should allow disabling even without credentials', async () => {
      await createAndInit();

      await component.toggleGithubEnabled(false);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_ENABLED',
        'false'
      );
    });

    it('should save enabled state when configured', async () => {
      await createAndInit({
        GITHUB_ENABLED: { value: 'false' },
        GITHUB_CLIENT_ID: { value: 'id' },
        GITHUB_CLIENT_SECRET: { value: 'secret' },
        GITHUB_CALLBACK_URL: null,
      });

      await component.toggleGithubEnabled(true);

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_ENABLED',
        'true'
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'GitHub sign-in enabled',
        'Close',
        { duration: 2000 }
      );
    });

    it('should revert toggle on save failure', async () => {
      await createAndInit({
        GITHUB_ENABLED: { value: 'false' },
        GITHUB_CLIENT_ID: { value: 'id' },
        GITHUB_CLIENT_SECRET: { value: 'secret' },
        GITHUB_CALLBACK_URL: null,
      });
      mockConfigService.setConfig.mockRejectedValue(new Error('Save failed'));

      await component.toggleGithubEnabled(true);

      expect(component.githubEnabled()).toBe(false); // Reverted
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to save setting',
        'Close',
        { duration: 3000 }
      );
    });
  });

  describe('saveCredentials', () => {
    it('should require client ID', async () => {
      await createAndInit();

      component.clientId.set('');
      await component.saveCredentials();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Client ID is required',
        'Close',
        { duration: 3000 }
      );
      expect(mockConfigService.setConfig).not.toHaveBeenCalled();
    });

    it('should save client ID and secret', async () => {
      await createAndInit();

      component.clientId.set('new-client-id');
      component.clientSecret.set('new-secret');
      await component.saveCredentials();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_CLIENT_ID',
        'new-client-id'
      );
      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_CLIENT_SECRET',
        'new-secret'
      );
      expect(component.isConfigured()).toBe(true);
      expect(component.clientSecret()).toBe(''); // Cleared after save
    });

    it('should skip saving empty secret (preserve existing)', async () => {
      await createAndInit();

      component.clientId.set('my-id');
      component.clientSecret.set('');
      await component.saveCredentials();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_CLIENT_ID',
        'my-id'
      );
      expect(mockConfigService.setConfig).not.toHaveBeenCalledWith(
        'GITHUB_CLIENT_SECRET',
        expect.anything()
      );
    });

    it('should save callback URL when provided', async () => {
      await createAndInit();

      component.clientId.set('my-id');
      component.callbackUrl.set('https://custom.example.com/callback');
      await component.saveCredentials();

      expect(mockConfigService.setConfig).toHaveBeenCalledWith(
        'GITHUB_CALLBACK_URL',
        'https://custom.example.com/callback'
      );
    });

    it('should handle save errors', async () => {
      await createAndInit();
      mockConfigService.setConfig.mockRejectedValue(new Error('Save failed'));

      component.clientId.set('my-id');
      await component.saveCredentials();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to save credentials',
        'Close',
        { duration: 3000 }
      );
    });

    it('should set isSaving during operation', async () => {
      await createAndInit();

      component.clientId.set('my-id');
      const savePromise = component.saveCredentials();
      expect(component.isSaving()).toBe(true);
      await savePromise;
      expect(component.isSaving()).toBe(false);
    });
  });

  describe('UI rendering', () => {
    it('should show loading spinner initially', () => {
      createComponent();
      const spinner = fixture.nativeElement.querySelector(
        '.loading-container mat-spinner'
      );
      expect(spinner).toBeTruthy();
    });

    it('should show error card on config load failure', async () => {
      mockConfigService.getConfig.mockRejectedValue(new Error('Failed'));
      createComponent();
      await flushPromises();
      fixture.detectChanges();

      const errorCard = fixture.nativeElement.querySelector('.error-card');
      expect(errorCard).toBeTruthy();
    });

    it('should show settings after loading', async () => {
      await createAndInit();

      const settingsPage = fixture.nativeElement.querySelector(
        '[data-testid="github-enabled-card"]'
      );
      expect(settingsPage).toBeTruthy();
    });
  });
});
