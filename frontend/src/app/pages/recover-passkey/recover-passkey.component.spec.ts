import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PasskeyRecoveryService } from '@services/auth/passkey-recovery.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { RecoverPasskeyComponent } from './recover-passkey.component';

describe('RecoverPasskeyComponent', () => {
  let component: RecoverPasskeyComponent;
  let fixture: ComponentFixture<RecoverPasskeyComponent>;
  let mockPasskeyRecoveryService: {
    requestRecovery: ReturnType<typeof vi.fn>;
  };
  let isEmailRecoveryEnabled: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    mockPasskeyRecoveryService = {
      requestRecovery: vi.fn().mockResolvedValue(undefined),
    };
    isEmailRecoveryEnabled = signal(true);

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), RecoverPasskeyComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: PasskeyRecoveryService,
          useValue: mockPasskeyRecoveryService,
        },
        {
          provide: SystemConfigService,
          useValue: { isEmailRecoveryEnabled },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecoverPasskeyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('shows error when submitting empty email', async () => {
    component.form.email().value.set('');
    await component.onSubmit();
    expect(component.error()).toBe('Email address is required');
    expect(mockPasskeyRecoveryService.requestRecovery).not.toHaveBeenCalled();
  });

  it('shows error when submitting whitespace-only email', async () => {
    component.form.email().value.set('   ');
    await component.onSubmit();
    expect(component.error()).toBe('Email address is required');
  });

  it('calls requestRecovery on valid submit and trims whitespace', async () => {
    component.form.email().value.set('  user@example.com  ');
    await component.onSubmit();

    expect(mockPasskeyRecoveryService.requestRecovery).toHaveBeenCalledWith(
      'user@example.com'
    );
    expect(component.submitted()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
    expect(component.error()).toBeNull();
  });

  it('shows generic error and stays unsubmitted on failure', async () => {
    mockPasskeyRecoveryService.requestRecovery.mockRejectedValue(
      new Error('boom')
    );
    component.form.email().value.set('user@example.com');
    await component.onSubmit();

    expect(component.error()).toBe('Something went wrong. Please try again.');
    expect(component.submitted()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
  });

  it('exposes isEmailRecoveryEnabled signal from SystemConfigService', () => {
    expect(component.isEmailRecoveryEnabled()).toBe(true);
    isEmailRecoveryEnabled.set(false);
    expect(component.isEmailRecoveryEnabled()).toBe(false);
  });

  // Regression guard: the submit path must be wired up in the *template*, not
  // just reachable by calling onSubmit() directly. A `<form>` whose submit
  // binding has no matching directive compiles fine and fails silently at
  // runtime, so dispatch a real submit event and assert the action is hit.
  describe('template submit wiring', () => {
    it('submits when the form element is submitted', async () => {
      component.form.email().value.set('user@example.com');
      fixture.detectChanges();

      const formEl: HTMLFormElement = fixture.nativeElement.querySelector(
        '[data-testid="recover-passkey-form"]'
      );
      expect(formEl).toBeTruthy();
      formEl.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      );
      await fixture.whenStable();

      expect(mockPasskeyRecoveryService.requestRecovery).toHaveBeenCalledWith(
        'user@example.com'
      );
    });

    it('disables native browser validation on the form', () => {
      const formEl: HTMLFormElement = fixture.nativeElement.querySelector(
        '[data-testid="recover-passkey-form"]'
      );
      expect(formEl.hasAttribute('novalidate')).toBe(true);
    });
  });
});
