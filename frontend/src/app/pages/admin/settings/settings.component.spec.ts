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

    const userApprovalReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    expect(userApprovalReq.request.method).toBe('GET');
    userApprovalReq.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'true',
      source: 'database',
    });

    const aiKillSwitchReq = httpMock.expectOne(
      '/api/v1/admin/config/AI_KILL_SWITCH'
    );
    expect(aiKillSwitchReq.request.method).toBe('GET');
    aiKillSwitchReq.flush({
      key: 'AI_KILL_SWITCH',
      value: 'true',
      source: 'database',
    });
  });

  it('should call setConfig when toggle is changed', async () => {
    fixture.detectChanges();

    // Respond to initial GET requests
    const getUserApprovalReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    getUserApprovalReq.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'true',
      source: 'database',
    });

    const getAiKillSwitchReq = httpMock.expectOne(
      '/api/v1/admin/config/AI_KILL_SWITCH'
    );
    getAiKillSwitchReq.flush({
      key: 'AI_KILL_SWITCH',
      value: 'true',
      source: 'database',
    });

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

    // Respond to initial GET requests
    const getUserApprovalReq = httpMock.expectOne(
      '/api/v1/admin/config/USER_APPROVAL_REQUIRED'
    );
    getUserApprovalReq.flush({
      key: 'USER_APPROVAL_REQUIRED',
      value: 'false',
      source: 'database',
    });

    const getAiKillSwitchReq = httpMock.expectOne(
      '/api/v1/admin/config/AI_KILL_SWITCH'
    );
    getAiKillSwitchReq.flush({
      key: 'AI_KILL_SWITCH',
      value: 'true',
      source: 'database',
    });

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

      httpMock.expectOne('/api/v1/admin/config/USER_APPROVAL_REQUIRED').flush({
        key: 'USER_APPROVAL_REQUIRED',
        value: 'true',
        source: 'database',
      });

      const aiKillSwitchReq = httpMock.expectOne(
        '/api/v1/admin/config/AI_KILL_SWITCH'
      );
      aiKillSwitchReq.flush({
        key: 'AI_KILL_SWITCH',
        value: 'false',
        source: 'database',
      });

      // Wait for async operations to complete
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.aiKillSwitchEnabled()).toBe(false);
    });

    it('should show confirmation dialog when disabling kill switch', async () => {
      fixture.detectChanges();

      httpMock.expectOne('/api/v1/admin/config/USER_APPROVAL_REQUIRED').flush({
        key: 'USER_APPROVAL_REQUIRED',
        value: 'true',
        source: 'database',
      });
      httpMock
        .expectOne('/api/v1/admin/config/AI_KILL_SWITCH')
        .flush({ key: 'AI_KILL_SWITCH', value: 'true', source: 'database' });

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

      httpMock.expectOne('/api/v1/admin/config/USER_APPROVAL_REQUIRED').flush({
        key: 'USER_APPROVAL_REQUIRED',
        value: 'true',
        source: 'database',
      });
      httpMock
        .expectOne('/api/v1/admin/config/AI_KILL_SWITCH')
        .flush({ key: 'AI_KILL_SWITCH', value: 'false', source: 'database' });

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

      httpMock.expectOne('/api/v1/admin/config/USER_APPROVAL_REQUIRED').flush({
        key: 'USER_APPROVAL_REQUIRED',
        value: 'true',
        source: 'database',
      });
      httpMock
        .expectOne('/api/v1/admin/config/AI_KILL_SWITCH')
        .flush({ key: 'AI_KILL_SWITCH', value: 'true', source: 'database' });

      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.aiKillSwitchLockedByEnv()).toBe(true);
    });
  });
});
