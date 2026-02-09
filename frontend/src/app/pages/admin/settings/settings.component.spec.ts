import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
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
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
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
});
