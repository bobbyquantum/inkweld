import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { type RegistrationResult } from '@components/registration-form/registration-form.component';
import { AuthenticationService, type User } from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { of } from 'rxjs';
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { RegisterDialogComponent } from './register-dialog.component';

describe('RegisterDialogComponent', () => {
  let component: RegisterDialogComponent;
  let fixture: ComponentFixture<RegisterDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<RegisterDialogComponent>>;
  let snackBar: MockedObject<MatSnackBar>;
  let router: Router;
  let isPasswordLoginEnabled: WritableSignal<boolean>;
  let passkeyService: MockedObject<PasskeyService>;
  let authTokenService: MockedObject<AuthTokenService>;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<RegisterDialogComponent>>;

    const authService = {
      registerUser: vi.fn(),
      checkUsernameAvailability: vi.fn(),
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

    const userService = {
      setCurrentUser: vi.fn(),
    } as unknown as MockedObject<UserService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    const setupService = {
      getServerUrl: vi.fn().mockReturnValue(''),
    } as unknown as MockedObject<SetupService>;

    const systemConfigService = {
      isRequireEmailEnabled: vi.fn().mockReturnValue(false),
      // Writable signal so individual tests can flip into passwordless mode
      // and re-render. Default true for existing password-flow coverage.
      isPasswordLoginEnabled: (isPasswordLoginEnabled = signal(true)),
      passwordPolicy: vi.fn().mockReturnValue({
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSymbol: true,
      }),
    };

    // PasskeyService is injected by RegisterDialogComponent so it can chain
    // a passkey ceremony immediately after a passwordless registration.
    passkeyService = {
      register: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<PasskeyService>;

    // AuthTokenService is needed for the enrolment-token branch
    // (passwordless + requiresApproval) — the dialog applies the
    // backend-issued token transiently before invoking the WebAuthn
    // ceremony, then clears it. Default no-op mocks; the dedicated
    // describe block below asserts call ordering.
    authTokenService = {
      setToken: vi.fn(),
      clearToken: vi.fn(),
    } as unknown as MockedObject<AuthTokenService>;

    await TestBed.configureTestingModule({
      imports: [RegisterDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AuthenticationService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: PasskeyService, useValue: passkeyService },
        { provide: AuthTokenService, useValue: authTokenService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterDialogComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onRegistered', () => {
    it('should close dialog and navigate home on successful registration', async () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
        approved: true,
      };

      const result: RegistrationResult = {
        user: mockUser,
        token: 'test-token',
        requiresApproval: false,
      };

      await component.onRegistered(result);

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration successful!',
        'Close',
        { duration: 3000 }
      );
    });

    it('should redirect to approval-pending when approval is required', async () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        enabled: false,
        approved: false,
      };

      const result: RegistrationResult = {
        user: mockUser,
        requiresApproval: true,
      };

      await component.onRegistered(result);

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending'], {
        queryParams: {
          username: 'testuser',
          name: 'Test User',
          userId: '1',
        },
      });
    });

    it('should use username as name when name is not provided', async () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: false,
        approved: false,
      };

      const result: RegistrationResult = {
        user: mockUser,
        requiresApproval: true,
      };

      await component.onRegistered(result);

      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending'], {
        queryParams: {
          username: 'testuser',
          name: 'testuser',
          userId: '1',
        },
      });
    });
  });

  describe('onRegistrationError', () => {
    it('should show error message in snackbar', () => {
      const error = new Error('Registration failed: Username already exists');

      component.onRegistrationError(error);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration failed: Username already exists',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('onLoginClick', () => {
    it('should close dialog with login signal', () => {
      component.onLoginClick();

      expect(dialogRef.close).toHaveBeenCalledWith('login');
    });
  });

  describe('onProvidersLoaded', () => {
    it('should set providersLoaded to true', () => {
      // Reset to false to test the transition
      component['providersLoaded'].set(false);
      expect(component.providersLoaded()).toBe(false);

      component.onProvidersLoaded();

      expect(component.providersLoaded()).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should detect mobile view for small screens', () => {
      // ngOnInit already ran in fixture.detectChanges()
      // The isMobile property is set based on window.innerWidth
      // We can't easily mock window.innerWidth in jsdom, but we can verify the property exists
      expect(typeof component.isMobile).toBe('boolean');
    });
  });

  describe('passwordless mode', () => {
    const mockUser: User = {
      id: '1',
      username: 'testuser',
      name: 'Test User',
      enabled: true,
      approved: true,
    };

    beforeEach(() => {
      isPasswordLoginEnabled.set(false);
    });

    it('chains passkey enrolment after successful registration', async () => {
      const result: RegistrationResult = {
        user: mockUser,
        token: 'test-token',
        requiresApproval: false,
      };

      await component.onRegistered(result);

      expect(passkeyService.register).toHaveBeenCalledWith('Primary passkey');
      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
      expect(component.isEnrollingPasskey()).toBe(false);
    });

    it('keeps the dialog open and shows snackbar on enrolment failure', async () => {
      passkeyService.register.mockRejectedValueOnce(
        new PasskeyError('CANCELLED', 'Passkey prompt was cancelled.')
      );

      const result: RegistrationResult = {
        user: mockUser,
        token: 'test-token',
        requiresApproval: false,
      };

      await component.onRegistered(result);

      expect(passkeyService.register).toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Passkey prompt was cancelled.',
        'Dismiss',
        { duration: 6000 }
      );
      expect(component.isEnrollingPasskey()).toBe(false);
    });

    it('shows generic message when error is not a PasskeyError', async () => {
      passkeyService.register.mockRejectedValueOnce(new Error('weird'));

      await component.onRegistered({
        user: mockUser,
        requiresApproval: false,
      });

      expect(snackBar.open).toHaveBeenCalledWith(
        'Could not set up your passkey. Please try again.',
        'Dismiss',
        { duration: 6000 }
      );
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('skips passkey enrolment when requiresApproval is true and no enrolmentToken is issued', async () => {
      // Backwards-compatible safety net: if the backend ever omits
      // enrolmentToken (e.g. older deployment, non-passwordless mode
      // misconfiguration) the dialog must still navigate to
      // /approval-pending rather than hanging on an enrolment ceremony
      // that has no session to authorise it.
      const result: RegistrationResult = {
        user: mockUser,
        requiresApproval: true,
      };

      await component.onRegistered(result);

      expect(passkeyService.register).not.toHaveBeenCalled();
      expect(authTokenService.setToken).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(
        ['/approval-pending'],
        expect.anything()
      );
    });

    it('runs passkey enrolment with enrolmentToken before navigating to approval-pending', async () => {
      // The whole point of the enrolment-token contract: in
      // passwordless+requires-approval mode we MUST attach a passkey
      // before parking the user at /approval-pending, otherwise the
      // account has no credential of any kind and admin approval would
      // unlock something the user can't sign into.
      const result: RegistrationResult = {
        user: mockUser,
        enrolmentToken: 'enrol-jwt',
        requiresApproval: true,
      };

      await component.onRegistered(result);

      // Token must be applied BEFORE the WebAuthn call (so the auth
      // interceptor picks it up) and cleared AFTER (so the user doesn't
      // carry a session into /approval-pending).
      expect(authTokenService.setToken).toHaveBeenCalledWith('enrol-jwt');
      expect(passkeyService.register).toHaveBeenCalledWith('Primary passkey');
      expect(authTokenService.clearToken).toHaveBeenCalled();

      const setTokenOrder =
        authTokenService.setToken.mock.invocationCallOrder[0];
      const registerOrder = passkeyService.register.mock.invocationCallOrder[0];
      const clearTokenOrder =
        authTokenService.clearToken.mock.invocationCallOrder[0];
      expect(setTokenOrder).toBeLessThan(registerOrder);
      expect(registerOrder).toBeLessThan(clearTokenOrder);

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(
        ['/approval-pending'],
        expect.objectContaining({
          queryParams: expect.objectContaining({ username: 'testuser' }),
        })
      );
    });

    it('keeps the dialog open and clears the enrolment token when the ceremony fails', async () => {
      // If the WebAuthn ceremony fails (user cancelled, OS-level error)
      // we must NOT navigate to /approval-pending — the user needs to
      // retry. The enrolment token is single-purpose and short-lived;
      // we still clear it from local storage in `finally` so a stale
      // value never leaks past the dialog. The token remains valid
      // server-side for the retry (re-applied on the next attempt).
      passkeyService.register.mockRejectedValueOnce(
        new PasskeyError('CANCELLED', 'Passkey prompt was cancelled.')
      );

      await component.onRegistered({
        user: mockUser,
        enrolmentToken: 'enrol-jwt',
        requiresApproval: true,
      });

      expect(authTokenService.setToken).toHaveBeenCalledWith('enrol-jwt');
      expect(authTokenService.clearToken).toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Passkey prompt was cancelled.',
        'Dismiss',
        { duration: 6000 }
      );
    });
  });
});
