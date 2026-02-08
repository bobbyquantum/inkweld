import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SetupService } from '@services/core/setup.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockPasswordResetService: { forgotPassword: ReturnType<typeof vi.fn> };
  const mockSetupService = { getServerUrl: () => '' };

  beforeEach(async () => {
    mockPasswordResetService = {
      forgotPassword: vi
        .fn()
        .mockResolvedValue({ message: 'Check your email' }),
    };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show error when submitting empty email', async () => {
    component.email = '';
    await component.onSubmit();
    expect(component.error()).toBe('Please enter your email address.');
  });

  it('should call forgotPassword on valid submit', async () => {
    component.email = 'user@example.com';
    await component.onSubmit();

    expect(mockPasswordResetService.forgotPassword).toHaveBeenCalledWith(
      'user@example.com'
    );
    expect(component.submitted()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should show error on failure', async () => {
    mockPasswordResetService.forgotPassword.mockRejectedValue(
      new Error('fail')
    );

    component.email = 'user@example.com';
    await component.onSubmit();

    expect(component.error()).toBe(
      'Something went wrong. Please try again later.'
    );
    expect(component.submitted()).toBe(false);
  });

  it('should trim whitespace from email', async () => {
    component.email = '  user@example.com  ';
    await component.onSubmit();

    expect(mockPasswordResetService.forgotPassword).toHaveBeenCalledWith(
      'user@example.com'
    );
  });
});
