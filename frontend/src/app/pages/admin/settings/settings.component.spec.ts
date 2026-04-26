import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BASE_PATH } from '@inkweld/variables';
import { SystemConfigService } from '@services/core/system-config.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSettingsComponent } from './settings.component';

// Helper to wait for next microtask
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

/** Flush all initial config GET requests that loadConfig() triggers */
function flushAllConfigRequests(
  httpMock: HttpTestingController,
  overrides: Partial<Record<string, string>> = {}
): void {
  const defaults: Record<string, string> = {
    USER_APPROVAL_REQUIRED: 'true',
    AI_KILL_SWITCH: 'true',
    REQUIRE_EMAIL: 'false',
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_REQUIRE_UPPERCASE: 'true',
    PASSWORD_REQUIRE_LOWERCASE: 'true',
    PASSWORD_REQUIRE_NUMBER: 'true',
    PASSWORD_REQUIRE_SYMBOL: 'true',
    SITE_URL: '',
    PASSKEYS_ENABLED: 'true',
    PASSWORD_LOGIN_ENABLED: 'true',
    EMAIL_RECOVERY_ENABLED: 'false',
  };
  const values = { ...defaults, ...overrides };

  for (const [key, value] of Object.entries(values)) {
    httpMock.expectOne(`/api/v1/admin/config/${key}`).flush({
      key,
      value,
      source: 'database',
    });
  }
}

describe('AdminSettingsComponent', () => {
  let component: AdminSettingsComponent;
  let fixture: ComponentFixture<AdminSettingsComponent>;
  let httpMock: HttpTestingController;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockSystemConfigService: {
    isAiKillSwitchLockedByEnv: ReturnType<typeof vi.fn>;
    refreshSystemFeatures: ReturnType<typeof vi.fn>;
    isEmailEnabled: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };

    mockSystemConfigService = {
      isAiKillSwitchLockedByEnv: vi.fn().mockReturnValue(false),
      refreshSystemFeatures: vi.fn(),
      isEmailEnabled: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        { provide: BASE_PATH, useValue: '' },
        { provide: SystemConfigService, useValue: mockSystemConfigService },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      .overrideComponent(AdminSettingsComponent, {
        remove: { imports: [MatDialogModule] },
        add: { providers: [{ provide: MatDialog, useValue: mockDialog }] },
      })
      .compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load config on init', () => {
    fixture.detectChanges();
    flushAllConfigRequests(httpMock);
    expect(component).toBeTruthy();
  });

  it('should call setConfig when toggle is changed', async () => {
    fixture.detectChanges();
    flushAllConfigRequests(httpMock);

    // Trigger toggle
    const togglePromise = component.toggleUserApproval(false);

    // Respond to PUT request
    const putReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({ value: 'false' });
    putReq.flush(null);

    await togglePromise;
    httpMock.verify();
  });

  it('should update signal value after successful save', async () => {
    fixture.detectChanges();
    flushAllConfigRequests(httpMock, { USER_APPROVAL_REQUIRED: 'false' });

    // Wait for initial config load to complete
    await flushMicrotasks();

    // Trigger toggle to true
    const togglePromise = component.toggleUserApproval(true);

    // Respond to PUT request
    const putReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    putReq.flush(null);

    await togglePromise;

    expect(component.userApprovalRequired()).toBe(true);
    httpMock.verify();
  });

  describe('AI Kill Switch', () => {
    it('should load AI kill switch value on init', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { AI_KILL_SWITCH: 'false' });

      // Wait for async operations to complete
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.aiKillSwitchEnabled()).toBe(false);
    });

    it('should show confirmation dialog when disabling kill switch', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);

      await flushMicrotasks();

      // Trigger toggle to false (disabling kill switch = enabling AI)
      const togglePromise = component.toggleAiKillSwitch(false);

      // Wait for dialog to close and async operations
      await flushMicrotasks();

      const putReq = httpMock.expectOne('/api/v1/admin/config/AI_KILL_SWITCH');
      expect(putReq.request.body).toEqual({ value: 'false' });
      putReq.flush(null);

      await togglePromise;

      expect(mockDialog.open).toHaveBeenCalled();
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });

    it('should not show dialog when enabling kill switch', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { AI_KILL_SWITCH: 'false' });

      await flushMicrotasks();

      // Trigger toggle to true (enabling kill switch = disabling AI)
      const togglePromise = component.toggleAiKillSwitch(true);

      const putReq = httpMock.expectOne('/api/v1/admin/config/AI_KILL_SWITCH');
      expect(putReq.request.body).toEqual({ value: 'true' });
      putReq.flush(null);

      await togglePromise;

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(component.aiKillSwitchEnabled()).toBe(true);
    });

    it('should check lock status from system config', async () => {
      mockSystemConfigService.isAiKillSwitchLockedByEnv.mockReturnValue(true);

      fixture.detectChanges();
      flushAllConfigRequests(httpMock);

      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.aiKillSwitchLockedByEnv()).toBe(true);
    });
  });

  describe('Password Policy', () => {
    it('should load password policy values on init', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_MIN_LENGTH: '12',
        PASSWORD_REQUIRE_UPPERCASE: 'false',
      });

      await flushMicrotasks();

      expect(component.passwordMinLength()).toBe(12);
      expect(component.passwordRequireUppercase()).toBe(false);
      expect(component.passwordRequireLowercase()).toBe(true);
      expect(component.passwordRequireNumber()).toBe(true);
      expect(component.passwordRequireSymbol()).toBe(true);
    });

    it('should fall back to 8 when stored PASSWORD_MIN_LENGTH is non-numeric', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSWORD_MIN_LENGTH: 'abc' });

      await flushMicrotasks();

      // parseInt('abc') is NaN → NaN || 8 → Math.max(1, 8) → 8
      expect(component.passwordMinLength()).toBe(8);
    });

    it('should fall back to 8 when stored PASSWORD_MIN_LENGTH is 0', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSWORD_MIN_LENGTH: '0' });

      await flushMicrotasks();

      // parseInt('0') is 0 → 0 || 8 → Math.max(1, 8) → 8
      expect(component.passwordMinLength()).toBe(8);
    });

    it('should save password min length', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('10');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      expect(putReq.request.body).toEqual({ value: '10' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(10);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });

    it('should toggle password policy requirement', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const togglePromise = component.togglePasswordPolicy(
        'PASSWORD_REQUIRE_SYMBOL',
        false
      );

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_REQUIRE_SYMBOL'
      );
      expect(putReq.request.body).toEqual({ value: 'false' });
      putReq.flush(null);

      await togglePromise;

      expect(component.passwordRequireSymbol()).toBe(false);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });
  });

  describe('Site URL', () => {
    it('should load site URL on init', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { SITE_URL: 'https://example.com' });

      await flushMicrotasks();

      expect(component.siteUrl()).toBe('https://example.com');
    });

    it('should save site URL', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.saveSiteUrl('https://mysite.com');

      const putReq = httpMock.expectOne('/api/v1/admin/config/SITE_URL');
      expect(putReq.request.body).toEqual({ value: 'https://mysite.com' });
      putReq.flush(null);

      await savePromise;

      expect(component.siteUrl()).toBe('https://mysite.com');
    });
  });

  describe('savePasswordMinLength', () => {
    it('should clamp empty string to 8 (default)', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      expect(putReq.request.body).toEqual({ value: '8' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(8);
    });

    it('should clamp non-numeric input to 8 (default)', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('abc');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      expect(putReq.request.body).toEqual({ value: '8' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(8);
    });

    it('should clamp negative input to 1', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('-5');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      expect(putReq.request.body).toEqual({ value: '1' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(1);
    });

    it('should clamp zero to default of 8 (falsy)', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('0');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      // parseInt('0') returns 0, which is falsy, so || 8 gives 8
      expect(putReq.request.body).toEqual({ value: '8' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(8);
    });

    it('should accept a valid positive number', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const savePromise = component.savePasswordMinLength('12');

      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_MIN_LENGTH'
      );
      expect(putReq.request.body).toEqual({ value: '12' });
      putReq.flush(null);

      await savePromise;

      expect(component.passwordMinLength()).toBe(12);
    });
  });

  describe('Passkeys', () => {
    it('should load passkeysEnabled value on init', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSKEYS_ENABLED: 'false' });
      await flushMicrotasks();
      expect(component.passkeysEnabled()).toBe(false);
    });

    it('should enable passkeys via togglePasskeys(true)', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSKEYS_ENABLED: 'false' });
      await flushMicrotasks();

      const togglePromise = component.togglePasskeys(true);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSKEYS_ENABLED'
      );
      expect(putReq.request.method).toBe('PUT');
      expect(putReq.request.body).toEqual({ value: 'true' });
      putReq.flush(null);

      await togglePromise;
      expect(component.passkeysEnabled()).toBe(true);
      expect(component.isSaving()).toBe(false);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });

    it('should disable passkeys via togglePasskeys(false)', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      const togglePromise = component.togglePasskeys(false);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSKEYS_ENABLED'
      );
      expect(putReq.request.body).toEqual({ value: 'false' });
      putReq.flush(null);

      await togglePromise;
      expect(component.passkeysEnabled()).toBe(false);
    });

    it('should revert state and not call refresh when save fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();

      mockSystemConfigService.refreshSystemFeatures.mockClear();

      const togglePromise = component.togglePasskeys(false);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSKEYS_ENABLED'
      );
      putReq.error(new ProgressEvent('error'), { status: 500 });

      await togglePromise;
      // State reverted to opposite of attempted value
      expect(component.passkeysEnabled()).toBe(true);
      expect(component.isSaving()).toBe(false);
      expect(
        mockSystemConfigService.refreshSystemFeatures
      ).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Email Recovery toggle', () => {
    it('does not show SMTP warning when email is configured', async () => {
      mockSystemConfigService.isEmailEnabled.mockReturnValue(true);
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();
      fixture.detectChanges();

      const warning = fixture.nativeElement.querySelector(
        '[data-testid="email-recovery-no-smtp-warning"]'
      );
      expect(warning).toBeFalsy();
    });

    it('shows SMTP warning and reports email not enabled when SMTP is not configured', async () => {
      mockSystemConfigService.isEmailEnabled.mockReturnValue(false);
      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();
      fixture.detectChanges();

      // The service signal should report email not enabled
      expect(component.isEmailEnabled()).toBe(false);

      const warning = fixture.nativeElement.querySelector(
        '[data-testid="email-recovery-no-smtp-warning"]'
      );
      expect(warning).toBeTruthy();
    });

    it('enables email recovery without confirming when password login is on', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_LOGIN_ENABLED: 'true',
        EMAIL_RECOVERY_ENABLED: 'false',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();

      const togglePromise = component.toggleEmailRecovery(true);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/EMAIL_RECOVERY_ENABLED'
      );
      expect(putReq.request.method).toBe('PUT');
      expect(putReq.request.body).toEqual({ value: 'true' });
      putReq.flush(null);

      await togglePromise;
      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(component.emailRecoveryEnabled()).toBe(true);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });

    it('disables email recovery without confirming when password login is on', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_LOGIN_ENABLED: 'true',
        EMAIL_RECOVERY_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();

      const togglePromise = component.toggleEmailRecovery(false);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/EMAIL_RECOVERY_ENABLED'
      );
      expect(putReq.request.body).toEqual({ value: 'false' });
      putReq.flush(null);

      await togglePromise;
      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(component.emailRecoveryEnabled()).toBe(false);
    });

    it('requires confirmation when disabling in passwordless mode and proceeds when confirmed', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_LOGIN_ENABLED: 'false',
        EMAIL_RECOVERY_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();
      mockDialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });

      const togglePromise = component.toggleEmailRecovery(false);
      // Wait a microtask so dialog logic resolves before we expect the PUT
      await flushMicrotasks();
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/EMAIL_RECOVERY_ENABLED'
      );
      putReq.flush(null);

      await togglePromise;
      expect(mockDialog.open).toHaveBeenCalledOnce();
      expect(component.emailRecoveryEnabled()).toBe(false);
    });

    it('aborts disable in passwordless mode when confirmation is cancelled', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_LOGIN_ENABLED: 'false',
        EMAIL_RECOVERY_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();
      mockDialog.open.mockReturnValueOnce({ afterClosed: () => of(false) });

      await component.toggleEmailRecovery(false);

      expect(mockDialog.open).toHaveBeenCalledOnce();
      // No PUT — verify by asking the controller for outstanding requests
      httpMock.expectNone('/api/v1/admin/config/EMAIL_RECOVERY_ENABLED');
      expect(component.emailRecoveryEnabled()).toBe(true);
    });

    it('reverts state when the save fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSWORD_LOGIN_ENABLED: 'true',
        EMAIL_RECOVERY_ENABLED: 'false',
      });
      await flushMicrotasks();

      const togglePromise = component.toggleEmailRecovery(true);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/EMAIL_RECOVERY_ENABLED'
      );
      putReq.error(new ProgressEvent('error'), { status: 500 });

      await togglePromise;
      expect(component.emailRecoveryEnabled()).toBe(false);
      expect(component.isSaving()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Password Login toggle', () => {
    it('refuses to disable when passkeys are also disabled', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSKEYS_ENABLED: 'false',
        PASSWORD_LOGIN_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();

      await component.togglePasswordLogin(false);

      // Symmetric guard: never lets both auth methods be off — no PUT, no
      // dialog, state untouched.
      expect(mockDialog.open).not.toHaveBeenCalled();
      httpMock.expectNone('/api/v1/admin/config/PASSWORD_LOGIN_ENABLED');
      expect(component.passwordLoginEnabled()).toBe(true);
    });

    it('enables password login without confirming', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSWORD_LOGIN_ENABLED: 'false' });
      await flushMicrotasks();
      mockDialog.open.mockClear();

      const togglePromise = component.togglePasswordLogin(true);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_LOGIN_ENABLED'
      );
      expect(putReq.request.body).toEqual({ value: 'true' });
      putReq.flush(null);

      await togglePromise;
      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(component.passwordLoginEnabled()).toBe(true);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    });

    it('requires confirmation when disabling and proceeds when confirmed', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSKEYS_ENABLED: 'true',
        PASSWORD_LOGIN_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();
      mockDialog.open.mockReturnValueOnce({ afterClosed: () => of(true) });

      const togglePromise = component.togglePasswordLogin(false);
      await flushMicrotasks();
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_LOGIN_ENABLED'
      );
      putReq.flush(null);

      await togglePromise;
      expect(mockDialog.open).toHaveBeenCalledOnce();
      expect(component.passwordLoginEnabled()).toBe(false);
    });

    it('aborts disable when confirmation is cancelled', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, {
        PASSKEYS_ENABLED: 'true',
        PASSWORD_LOGIN_ENABLED: 'true',
      });
      await flushMicrotasks();
      mockDialog.open.mockClear();
      mockDialog.open.mockReturnValueOnce({ afterClosed: () => of(false) });

      await component.togglePasswordLogin(false);

      expect(mockDialog.open).toHaveBeenCalledOnce();
      httpMock.expectNone('/api/v1/admin/config/PASSWORD_LOGIN_ENABLED');
      expect(component.passwordLoginEnabled()).toBe(true);
    });

    it('reverts state when the save fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { PASSWORD_LOGIN_ENABLED: 'false' });
      await flushMicrotasks();

      const togglePromise = component.togglePasswordLogin(true);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/PASSWORD_LOGIN_ENABLED'
      );
      putReq.error(new ProgressEvent('error'), { status: 500 });

      await togglePromise;
      expect(component.passwordLoginEnabled()).toBe(false);
      expect(component.isSaving()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('toggleRequireEmail', () => {
    it('persists the new value and refreshes system features on success', async () => {
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { REQUIRE_EMAIL: 'false' });
      await flushMicrotasks();
      mockSystemConfigService.refreshSystemFeatures.mockClear();

      const togglePromise = component.toggleRequireEmail(true);
      const putReq = httpMock.expectOne('/api/v1/admin/config/REQUIRE_EMAIL');
      expect(putReq.request.method).toBe('PUT');
      expect(putReq.request.body).toEqual({ value: 'true' });
      putReq.flush(null);

      await togglePromise;
      expect(component.requireEmailEnabled()).toBe(true);
      expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
      expect(component.isSaving()).toBe(false);
    });

    it('reverts on save failure', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { REQUIRE_EMAIL: 'false' });
      await flushMicrotasks();

      const togglePromise = component.toggleRequireEmail(true);
      const putReq = httpMock.expectOne('/api/v1/admin/config/REQUIRE_EMAIL');
      putReq.error(new ProgressEvent('error'), { status: 500 });

      await togglePromise;
      expect(component.requireEmailEnabled()).toBe(false);
      expect(component.isSaving()).toBe(false);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('toggleUserApproval error path', () => {
    it('reverts on save failure', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      fixture.detectChanges();
      flushAllConfigRequests(httpMock, { USER_APPROVAL_REQUIRED: 'true' });
      await flushMicrotasks();

      const togglePromise = component.toggleUserApproval(false);
      const putReq = httpMock.expectOne(
        '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
      );
      putReq.error(new ProgressEvent('error'), { status: 500 });

      await togglePromise;
      expect(component.userApprovalRequired()).toBe(true);
      expect(component.isSaving()).toBe(false);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('loadConfig error path', () => {
    it('records an error and stops loading when loadConfig throws', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // adminConfigService.getConfig() swallows HTTP errors and returns null,
      // so the only way the catch in loadConfig() runs is if something inside
      // the try-block throws. Stub the systemConfig signal to throw to simulate
      // that — this exercises the error/isLoading state cleanup branch.
      mockSystemConfigService.isAiKillSwitchLockedByEnv.mockImplementation(
        () => {
          throw new Error('boom');
        }
      );

      fixture.detectChanges();
      flushAllConfigRequests(httpMock);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(component.isLoading()).toBe(false);
      expect(component.error()).toBeInstanceOf(Error);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
