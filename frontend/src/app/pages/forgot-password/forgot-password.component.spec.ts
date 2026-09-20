import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SetupService } from '@services/core/setup.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
      imports: [translocoTestProvider(), ForgotPasswordComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
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
    component.form.email().value.set('');
    await component.onSubmit();
    expect(component.error()).toBe('Email address is required');
  });

  it('should call forgotPassword on valid submit', async () => {
    component.form.email().value.set('user@example.com');
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

    component.form.email().value.set('user@example.com');
    await component.onSubmit();

    expect(component.error()).toBe('Something went wrong. Please try again.');
    expect(component.submitted()).toBe(false);
  });

  // Regression guard: the submit path must be wired up in the *template*, not
  // just reachable by calling onSubmit() directly. A `<form>` whose submit
  // binding has no matching directive compiles fine and fails silently at
  // runtime, so dispatch a real submit event and assert the service is hit.
  it('submits when the form element is submitted', async () => {
    component.form.email().value.set('user@example.com');
    fixture.detectChanges();

    const formEl: HTMLFormElement = fixture.nativeElement.querySelector(
      '[data-testid="forgot-password-form"]'
    );
    expect(formEl).toBeTruthy();
    formEl.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await fixture.whenStable();

    expect(mockPasswordResetService.forgotPassword).toHaveBeenCalledWith(
      'user@example.com'
    );
  });

  it('disables native browser validation on the form', () => {
    const formEl: HTMLFormElement = fixture.nativeElement.querySelector(
      '[data-testid="forgot-password-form"]'
    );
    expect(formEl.hasAttribute('novalidate')).toBe(true);
  });

  it('should trim whitespace from email', async () => {
    component.form.email().value.set('  user@example.com  ');
    await component.onSubmit();

    expect(mockPasswordResetService.forgotPassword).toHaveBeenCalledWith(
      'user@example.com'
    );
  });
});
