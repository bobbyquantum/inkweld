import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { PasskeyError } from '@services/auth/passkey.service';
import { PasskeyRecoveryService } from '@services/auth/passkey-recovery.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoverPasskeyRedeemComponent } from './recover-passkey-redeem.component';

describe('RecoverPasskeyRedeemComponent', () => {
  let component: RecoverPasskeyRedeemComponent;
  let fixture: ComponentFixture<RecoverPasskeyRedeemComponent>;
  let mockPasskeyRecoveryService: {
    isSupported: ReturnType<typeof vi.fn>;
    redeemRecovery: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let queryParams: Record<string, string>;

  async function setup(opts?: {
    token?: string | null;
    supported?: boolean;
  }): Promise<void> {
    queryParams = {};
    if (opts?.token !== null) {
      queryParams['token'] = opts?.token ?? 'tok-123';
    }

    mockPasskeyRecoveryService = {
      isSupported: vi.fn().mockReturnValue(opts?.supported ?? true),
      redeemRecovery: vi.fn().mockResolvedValue({
        passkey: { id: 'pk-1' },
      }),
    };
    mockRouter = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [RecoverPasskeyRedeemComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: PasskeyRecoveryService,
          useValue: mockPasskeyRecoveryService,
        },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string): string | null => queryParams[key] ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecoverPasskeyRedeemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('creates and reads token from query params', async () => {
    await setup({ token: 'abc' });
    expect(component).toBeTruthy();
    expect(component.noToken()).toBe(false);
    expect(component.browserUnsupported()).toBe(false);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('flags noToken when ?token query param is missing', async () => {
    await setup({ token: null });
    expect(component.noToken()).toBe(true);
    expect(mockPasskeyRecoveryService.isSupported).not.toHaveBeenCalled();
  });

  it('flags browserUnsupported when WebAuthn is unavailable', async () => {
    await setup({ supported: false });
    expect(component.browserUnsupported()).toBe(true);
  });

  describe('onSubmit()', () => {
    beforeEach(async () => {
      await setup({ token: 'tok-123' });
    });

    it('does nothing when noToken', async () => {
      TestBed.resetTestingModule();
      await setup({ token: null });
      await component.onSubmit();
      expect(mockPasskeyRecoveryService.redeemRecovery).not.toHaveBeenCalled();
    });

    it('does nothing when already submitting', async () => {
      component.isSubmitting.set(true);
      await component.onSubmit();
      expect(mockPasskeyRecoveryService.redeemRecovery).not.toHaveBeenCalled();
    });

    it('redeems with passkey name and shows success', async () => {
      component.passkeyName = 'My Backup';
      await component.onSubmit();

      expect(mockPasskeyRecoveryService.redeemRecovery).toHaveBeenCalledWith(
        'tok-123',
        'My Backup'
      );
      expect(component.success()).toBe(true);
      expect(component.error()).toBeNull();
      expect(component.isSubmitting()).toBe(false);
    });

    it('passes undefined when name is empty after trim', async () => {
      component.passkeyName = '   ';
      await component.onSubmit();
      expect(mockPasskeyRecoveryService.redeemRecovery).toHaveBeenCalledWith(
        'tok-123',
        undefined
      );
    });

    it('shows PasskeyError message when redemption fails', async () => {
      mockPasskeyRecoveryService.redeemRecovery.mockRejectedValueOnce(
        new PasskeyError('CANCELLED', 'Passkey prompt was cancelled.')
      );
      await component.onSubmit();
      expect(component.error()).toBe('Passkey prompt was cancelled.');
      expect(component.success()).toBe(false);
    });

    it('shows generic message for non-PasskeyError', async () => {
      mockPasskeyRecoveryService.redeemRecovery.mockRejectedValueOnce(
        new Error('weird')
      );
      await component.onSubmit();
      expect(component.error()).toContain('Could not enrol your new passkey');
      expect(component.success()).toBe(false);
    });
  });

  describe('goToLogin()', () => {
    it('navigates home with showLogin=true', async () => {
      await setup({ token: 'tok' });
      await component.goToLogin();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { showLogin: 'true' },
      });
    });
  });
});
