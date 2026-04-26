import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PasskeyRecoveryService } from '@services/auth/passkey-recovery.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      imports: [RecoverPasskeyComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
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
    component.email = '';
    await component.onSubmit();
    expect(component.error()).toBe('Please enter your email address.');
    expect(mockPasskeyRecoveryService.requestRecovery).not.toHaveBeenCalled();
  });

  it('shows error when submitting whitespace-only email', async () => {
    component.email = '   ';
    await component.onSubmit();
    expect(component.error()).toBe('Please enter your email address.');
  });

  it('calls requestRecovery on valid submit and trims whitespace', async () => {
    component.email = '  user@example.com  ';
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
    component.email = 'user@example.com';
    await component.onSubmit();

    expect(component.error()).toBe(
      'Something went wrong. Please try again later.'
    );
    expect(component.submitted()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
  });

  it('exposes isEmailRecoveryEnabled signal from SystemConfigService', () => {
    expect(component.isEmailRecoveryEnabled()).toBe(true);
    isEmailRecoveryEnabled.set(false);
    expect(component.isEmailRecoveryEnabled()).toBe(false);
  });
});
