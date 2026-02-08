import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { AdminEmailService } from '@services/admin/admin-email.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminEmailSettingsComponent } from './email-settings.component';

describe('AdminEmailSettingsComponent', () => {
  let component: AdminEmailSettingsComponent;
  let fixture: ComponentFixture<AdminEmailSettingsComponent>;

  let mockConfigService: {
    getConfig: ReturnType<typeof vi.fn>;
    setConfig: ReturnType<typeof vi.fn>;
  };

  let mockEmailService: {
    sendTestEmail: ReturnType<typeof vi.fn>;
  };

  let mockSystemConfigService: {
    refreshSystemFeatures: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockConfigService = {
      getConfig: vi.fn().mockResolvedValue(null),
      setConfig: vi.fn().mockResolvedValue(undefined),
    };

    mockEmailService = {
      sendTestEmail: vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Email sent' }),
    };

    mockSystemConfigService = {
      refreshSystemFeatures: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminEmailSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AdminConfigService, useValue: mockConfigService },
        { provide: AdminEmailService, useValue: mockEmailService },
        {
          provide: SystemConfigService,
          useValue: mockSystemConfigService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminEmailSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load config on init', async () => {
    mockConfigService.getConfig
      .mockResolvedValueOnce({ value: 'true' })
      .mockResolvedValueOnce({ value: 'smtp.example.com' })
      .mockResolvedValueOnce({ value: '465' })
      .mockResolvedValueOnce({ value: 'tls' })
      .mockResolvedValueOnce({ value: 'user@example.com' })
      .mockResolvedValueOnce({ value: 'noreply@example.com' })
      .mockResolvedValueOnce({ value: 'My App' });

    await component.loadConfig();

    expect(component.emailEnabled()).toBe(true);
    expect(component.host()).toBe('smtp.example.com');
    expect(component.port()).toBe('465');
    expect(component.encryption()).toBe('tls');
    expect(component.username()).toBe('user@example.com');
    expect(component.fromAddress()).toBe('noreply@example.com');
    expect(component.fromName()).toBe('My App');
    expect(component.isLoading()).toBe(false);
  });

  it('should handle config load failure', async () => {
    mockConfigService.getConfig.mockRejectedValue(new Error('DB error'));

    await component.loadConfig();

    expect(component.error()).toBeInstanceOf(Error);
    expect(component.isLoading()).toBe(false);
  });

  it('should toggle email enabled', async () => {
    await component.toggleEmailEnabled(true);

    expect(mockConfigService.setConfig).toHaveBeenCalledWith(
      'EMAIL_ENABLED',
      'true'
    );
    expect(component.emailEnabled()).toBe(true);
    expect(mockSystemConfigService.refreshSystemFeatures).toHaveBeenCalled();
    expect(component.isSaving()).toBe(false);
  });

  it('should revert toggle on failure', async () => {
    mockConfigService.setConfig.mockRejectedValue(new Error('fail'));

    await component.toggleEmailEnabled(true);

    expect(component.emailEnabled()).toBe(false);
    expect(component.isSaving()).toBe(false);
  });

  it('should save SMTP config', async () => {
    component.host.set('smtp.test.com');
    component.port.set('587');
    component.encryption.set('starttls');
    component.username.set('user');
    component.fromAddress.set('from@test.com');
    component.fromName.set('Test');
    component.password.set('secret');

    await component.saveSmtpConfig();

    expect(mockConfigService.setConfig).toHaveBeenCalledWith(
      'EMAIL_HOST',
      'smtp.test.com'
    );
    expect(mockConfigService.setConfig).toHaveBeenCalledWith(
      'EMAIL_PASSWORD',
      'secret'
    );
    expect(component.password()).toBe('');
    expect(component.isSaving()).toBe(false);
  });

  it('should not save password when empty', async () => {
    component.host.set('smtp.test.com');
    component.password.set('');

    await component.saveSmtpConfig();

    expect(mockConfigService.setConfig).not.toHaveBeenCalledWith(
      'EMAIL_PASSWORD',
      expect.anything()
    );
  });

  it('should handle save failure', async () => {
    mockConfigService.setConfig.mockRejectedValue(new Error('save error'));
    component.host.set('smtp.test.com');

    await component.saveSmtpConfig();

    expect(component.isSaving()).toBe(false);
  });

  it('should send test email', async () => {
    await component.sendTestEmail();

    expect(mockEmailService.sendTestEmail).toHaveBeenCalled();
    expect(component.testResult()).toEqual({
      success: true,
      message: 'Email sent',
    });
    expect(component.isSendingTest()).toBe(false);
  });

  it('should handle test email failure', async () => {
    mockEmailService.sendTestEmail.mockRejectedValue(
      new Error('SMTP connection refused')
    );

    await component.sendTestEmail();

    expect(component.testResult()).toEqual({
      success: false,
      message: 'SMTP connection refused',
    });
    expect(component.isSendingTest()).toBe(false);
  });
});
