import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { describe, expect, it, vi } from 'vitest';

import { ResetPasswordComponent } from './reset-password.component';

const DEFAULT_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

// A password meeting all default policy rules
const VALID_PASSWORD = 'Test123!@';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockPasswordResetService: {
    resetPassword: ReturnType<typeof vi.fn>;
  };
  const mockSetupService = { getServerUrl: () => '', getMode: () => 'online' };

  const mockSystemConfigService = {
    isRequireEmailEnabled: signal(false),
    passwordPolicy: signal(DEFAULT_POLICY),
    isConfigLoaded: signal(true),
    isAiKillSwitchEnabled: signal(true),
    isAiKillSwitchLockedByEnv: signal(false),
    isAiLintingEnabled: signal(false),
    isAiImageGenerationEnabled: signal(false),
    isUserApprovalRequired: signal(true),
    isEmailEnabled: signal(false),
    isLocalMode: signal(false),
    systemFeatures: signal({
      aiKillSwitch: true,
      aiKillSwitchLockedByEnv: false,
      aiAutoReview: false,
      aiImageGeneration: false,
      userApprovalRequired: true,
      appMode: 'BOTH',
      emailEnabled: false,
      requireEmail: false,
      passwordPolicy: DEFAULT_POLICY,
      passkeysEnabled: true,
    }),
    refreshSystemFeatures: vi.fn(),
    getAiImageGenerationStatus: vi.fn().mockReturnValue({ status: 'hidden' }),
  };

  function setupWithToken(token: string | null) {
    mockPasswordResetService = {
      resetPassword: vi.fn().mockResolvedValue({ message: 'Password reset' }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SetupService, useValue: mockSetupService },
        {
          provide: SystemConfigService,
          useValue: mockSystemConfigService,
        },
        {
          provide: PasswordResetService,
          useValue: mockPasswordResetService,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(token ? { token } : {}),
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setupWithToken('valid-token');
    expect(component).toBeTruthy();
  });

  it('should show no-token error when token is missing', () => {
    setupWithToken(null);
    expect(component.noToken()).toBe(true);
  });

  it('should not show no-token error when token is present', () => {
    setupWithToken('abc123');
    expect(component.noToken()).toBe(false);
  });

  it('should validate passwords meet policy requirements', async () => {
    setupWithToken('abc123');
    component.form.newPassword().value.set('short');
    component.form.confirmPassword().value.set('short');
    await fixture.whenStable();

    expect(component.isFormValid()).toBe(false);
  });

  it('should validate passwords match', async () => {
    setupWithToken('abc123');
    component.form.newPassword().value.set(VALID_PASSWORD);
    component.form.confirmPassword().value.set('different');
    await fixture.whenStable();

    expect(component.isFormValid()).toBe(false);
    expect(component.getPasswordError()).toBe('Passwords do not match');
  });

  it('should return null error when form is valid', async () => {
    setupWithToken('abc123');
    component.form.newPassword().value.set(VALID_PASSWORD);
    component.form.confirmPassword().value.set(VALID_PASSWORD);
    await fixture.whenStable();

    expect(component.isFormValid()).toBe(true);
    expect(component.getPasswordError()).toBeNull();
  });

  it('should call resetPassword on valid submit', async () => {
    setupWithToken('my-token');
    component.form.newPassword().value.set(VALID_PASSWORD);
    component.form.confirmPassword().value.set(VALID_PASSWORD);
    await fixture.whenStable();

    await component.onSubmit();

    expect(mockPasswordResetService.resetPassword).toHaveBeenCalledWith(
      'my-token',
      VALID_PASSWORD
    );
    expect(component.success()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should not submit when form is invalid', async () => {
    setupWithToken('my-token');
    component.form.newPassword().value.set('abc');
    component.form.confirmPassword().value.set('abc');
    await fixture.whenStable();

    await component.onSubmit();

    expect(mockPasswordResetService.resetPassword).not.toHaveBeenCalled();
  });

  it('should handle HTTP error response', async () => {
    setupWithToken('expired-token');
    mockPasswordResetService.resetPassword.mockRejectedValue({
      error: { error: 'Token has expired' },
    });

    component.form.newPassword().value.set(VALID_PASSWORD);
    component.form.confirmPassword().value.set(VALID_PASSWORD);
    await fixture.whenStable();
    await component.onSubmit();

    expect(component.error()).toBe('Token has expired');
    expect(component.success()).toBe(false);
  });

  it('should handle unexpected error', async () => {
    setupWithToken('bad-token');
    mockPasswordResetService.resetPassword.mockRejectedValue(
      new Error('Network error')
    );

    component.form.newPassword().value.set(VALID_PASSWORD);
    component.form.confirmPassword().value.set(VALID_PASSWORD);
    await fixture.whenStable();
    await component.onSubmit();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });

  it('should update password requirements on input', async () => {
    setupWithToken('abc123');
    component.form.newPassword().value.set('Aa1!aaaa');
    await fixture.whenStable();

    expect(component.passwordRequirements['minLength'].met).toBe(true);
    expect(component.passwordRequirements['uppercase'].met).toBe(true);
    expect(component.passwordRequirements['lowercase'].met).toBe(true);
    expect(component.passwordRequirements['number'].met).toBe(true);
    expect(component.passwordRequirements['special'].met).toBe(true);
  });

  it('should detect unmet requirements', async () => {
    setupWithToken('abc123');
    component.form.newPassword().value.set('lowercase');
    await fixture.whenStable();

    expect(component.passwordRequirements['lowercase'].met).toBe(true);
    expect(component.passwordRequirements['uppercase'].met).toBe(false);
    expect(component.passwordRequirements['number'].met).toBe(false);
    expect(component.passwordRequirements['special'].met).toBe(false);
  });
});
