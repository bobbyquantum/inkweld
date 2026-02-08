import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SetupService } from '@services/core/setup.service';
import { describe, expect, it, vi } from 'vitest';

import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockPasswordResetService: {
    resetPassword: ReturnType<typeof vi.fn>;
  };
  const mockSetupService = { getServerUrl: () => '' };

  function setupWithToken(token: string | null) {
    mockPasswordResetService = {
      resetPassword: vi.fn().mockResolvedValue({ message: 'Password reset' }),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: SetupService, useValue: mockSetupService },
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

  it('should validate passwords are at least 6 characters', () => {
    setupWithToken('abc123');
    component.newPassword = 'short';
    component.confirmPassword = 'short';

    expect(component.isFormValid()).toBe(false);
    expect(component.getPasswordError()).toBe(
      'Password must be at least 6 characters'
    );
  });

  it('should validate passwords match', () => {
    setupWithToken('abc123');
    component.newPassword = 'password123';
    component.confirmPassword = 'different';

    expect(component.isFormValid()).toBe(false);
    expect(component.getPasswordError()).toBe('Passwords do not match');
  });

  it('should return null error when form is valid', () => {
    setupWithToken('abc123');
    component.newPassword = 'password123';
    component.confirmPassword = 'password123';

    expect(component.isFormValid()).toBe(true);
    expect(component.getPasswordError()).toBeNull();
  });

  it('should call resetPassword on valid submit', async () => {
    setupWithToken('my-token');
    component.newPassword = 'newpass123';
    component.confirmPassword = 'newpass123';

    await component.onSubmit();

    expect(mockPasswordResetService.resetPassword).toHaveBeenCalledWith(
      'my-token',
      'newpass123'
    );
    expect(component.success()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should not submit when form is invalid', async () => {
    setupWithToken('my-token');
    component.newPassword = 'abc';
    component.confirmPassword = 'abc';

    await component.onSubmit();

    expect(mockPasswordResetService.resetPassword).not.toHaveBeenCalled();
  });

  it('should handle HTTP error response', async () => {
    setupWithToken('expired-token');
    mockPasswordResetService.resetPassword.mockRejectedValue({
      error: { error: 'Token has expired' },
    });

    component.newPassword = 'newpass123';
    component.confirmPassword = 'newpass123';
    await component.onSubmit();

    expect(component.error()).toBe('Token has expired');
    expect(component.success()).toBe(false);
  });

  it('should handle unexpected error', async () => {
    setupWithToken('bad-token');
    mockPasswordResetService.resetPassword.mockRejectedValue(
      new Error('Network error')
    );

    component.newPassword = 'newpass123';
    component.confirmPassword = 'newpass123';
    await component.onSubmit();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
