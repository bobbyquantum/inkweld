import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { AuthenticationService, type User } from '@inkweld/index';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService, UserServiceError } from '@services/user/user.service';
import { of } from 'rxjs';
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { LoginDialogComponent } from './login-dialog.component';

describe('LoginDialogComponent', () => {
  let component: LoginDialogComponent;
  let fixture: ComponentFixture<LoginDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<LoginDialogComponent>>;
  let userService: MockedObject<UserService>;
  let snackBar: MockedObject<MatSnackBar>;
  let authService: MockedObject<AuthenticationService>;
  let passkeyService: MockedObject<PasskeyService>;
  let router: Router;

  const fakeUser: User = {
    id: 'user-1',
    username: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    approved: true,
    enabled: true,
    isAdmin: false,
    hasAvatar: false,
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<LoginDialogComponent>>;

    userService = {
      login: vi.fn(),
      setCurrentUser: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<UserService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    authService = {
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

    passkeyService = {
      isSupported: vi.fn().mockReturnValue(true),
      login: vi.fn().mockResolvedValue(fakeUser),
      abortLogin: vi.fn(),
    } as unknown as MockedObject<PasskeyService>;

    // Provide a synchronous fake of SystemConfigService so the dialog renders
    // deterministically. Real one fetches /system-features async; without
    // intercepting that we'd be at the mercy of the pessimistic initial
    // signal values (passwordLogin: false), which would hide the password
    // form and break the existing tests that exercise it.
    const systemConfigStub = {
      isEmailEnabled: signal(false).asReadonly(),
      isPasswordLoginEnabled: signal(true).asReadonly(),
      isEmailRecoveryEnabled: signal(false).asReadonly(),
      isPasskeysEnabled: signal(true).asReadonly(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AuthenticationService, useValue: authService },
        { provide: PasskeyService, useValue: passkeyService },
        { provide: SystemConfigService, useValue: systemConfigStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginDialogComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('form validation', () => {
    it('should return false for isFormValid when username is empty', () => {
      component.username = '';
      component.password = 'password123';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return false for isFormValid when password is empty', () => {
      component.username = 'testuser';
      component.password = '';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return true for isFormValid when both fields are filled', () => {
      component.username = 'testuser';
      component.password = 'password123';
      expect(component.isFormValid()).toBe(true);
    });

    it('should return false for isFormValid when resubmitting same failed password', () => {
      component.username = 'testuser';
      component.password = 'wrongpassword';
      component.lastAttemptedPassword = 'wrongpassword';
      expect(component.isFormValid()).toBe(false);
    });

    it('should disable login button when form is invalid', () => {
      component.username = '';
      component.password = '';
      component.providersLoaded.set(true);
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should disable login button when providers not loaded', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(false);
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should enable login button when form is valid and providers loaded', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      expect(component.isLoginButtonDisabled()).toBe(false);
    });

    it('should disable login button when logging in', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      component.isLoggingIn.set(true);
      expect(component.isLoginButtonDisabled()).toBe(true);
    });
  });

  describe('input change handlers', () => {
    it('should clear password error when username changes', () => {
      component.passwordError.set('Some error');
      component.onUsernameChange();
      expect(component.passwordError()).toBeNull();
    });

    it('should clear lastAttemptedUsername when username differs from last attempt', () => {
      component.lastAttemptedUsername = 'olduser';
      component.username = 'newuser';
      component.onUsernameChange();
      expect(component.lastAttemptedUsername).toBe('');
    });

    it('should clear password error when password changes', () => {
      component.passwordError.set('Some error');
      component.onPasswordChange();
      expect(component.passwordError()).toBeNull();
    });

    it('should clear lastAttemptedPassword when password differs from last attempt', () => {
      component.lastAttemptedPassword = 'oldpass';
      component.password = 'newpass';
      component.onPasswordChange();
      expect(component.lastAttemptedPassword).toBe('');
    });
  });

  describe('onLogin', () => {
    it('should show error when form is invalid', async () => {
      component.username = '';
      component.password = '';

      await component.onLogin();

      expect(component.passwordError()).toBe(
        'Please enter both username and password.'
      );
      expect(userService.login).not.toHaveBeenCalled();
    });

    it('should call userService.login with correct credentials', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      userService.login.mockResolvedValue(undefined);

      await component.onLogin();

      expect(userService.login).toHaveBeenCalledWith('testuser', 'password123');
    });

    it('should close dialog on successful login', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      userService.login.mockResolvedValue(undefined);

      await component.onLogin();

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should redirect to OAuth return URL if present', async () => {
      // Set up OAuth return URL in sessionStorage (set by authGuard)
      const oauthUrl =
        '/oauth/authorize?client_id=test&redirect_uri=https://example.com';
      sessionStorage.setItem('oauth_return_url', oauthUrl);

      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      userService.login.mockResolvedValue(undefined);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      await component.onLogin();

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigateByUrl).toHaveBeenCalledWith(oauthUrl);
      expect(router.navigate).not.toHaveBeenCalled();
      // Verify sessionStorage was cleared
      expect(sessionStorage.getItem('oauth_return_url')).toBeNull();
    });

    it('should show success snackbar on successful login', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      userService.login.mockResolvedValue(undefined);

      await component.onLogin();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Welcome back, testuser!',
        'Close',
        { duration: 3000 }
      );
    });

    it('should handle LOGIN_FAILED error', async () => {
      component.username = 'testuser';
      component.password = 'wrongpassword';
      component.providersLoaded.set(true);
      userService.login.mockRejectedValue(
        new UserServiceError('LOGIN_FAILED', 'Invalid credentials')
      );

      await component.onLogin();

      expect(component.passwordError()).toBe('Invalid username or password');
      expect(component.lastAttemptedPassword).toBe('wrongpassword');
    });

    it('should redirect to approval-pending on ACCOUNT_PENDING error', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);
      userService.login.mockRejectedValue(
        new UserServiceError('ACCOUNT_PENDING', 'Account pending approval')
      );

      await component.onLogin();

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending']);
    });

    it('should set isLoggingIn to true during login', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded.set(true);

      let resolveLogin: () => void;
      const loginPromise = new Promise<void>(resolve => {
        resolveLogin = resolve;
      });
      userService.login.mockReturnValue(loginPromise);

      const loginPromiseResult = component.onLogin();
      expect(component.isLoggingIn()).toBe(true);

      resolveLogin!();
      await loginPromiseResult;
      expect(component.isLoggingIn()).toBe(false);
    });
  });

  describe('onRegisterClick', () => {
    it('should close dialog with "register" result', () => {
      component.onRegisterClick();
      expect(dialogRef.close).toHaveBeenCalledWith('register');
    });
  });

  describe('onPasskeyLogin', () => {
    it('logs in, syncs user, shows snackbar and closes dialog on success', async () => {
      await component.onPasskeyLogin();

      expect(passkeyService.login).toHaveBeenCalledOnce();
      expect(userService.setCurrentUser).toHaveBeenCalledWith(fakeUser);
      expect(snackBar.open).toHaveBeenCalledWith(
        `Welcome back, ${fakeUser.username}!`,
        'Close',
        { duration: 3000 }
      );
      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('redirects to OAuth return URL when present', async () => {
      const oauthUrl = '/oauth/authorize?client_id=test';
      sessionStorage.setItem('oauth_return_url', oauthUrl);
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      await component.onPasskeyLogin();

      expect(router.navigateByUrl).toHaveBeenCalledWith(oauthUrl);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('oauth_return_url')).toBeNull();
    });

    it('is silent (no snackbar, no close) when CANCELLED', async () => {
      passkeyService.login.mockRejectedValue(
        new PasskeyError('CANCELLED', 'Cancelled by user')
      );

      await component.onPasskeyLogin();

      expect(snackBar.open).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('redirects to /approval-pending on PENDING_APPROVAL error', async () => {
      passkeyService.login.mockRejectedValue(
        new PasskeyError('PENDING_APPROVAL', 'Account pending approval')
      );

      await component.onPasskeyLogin();

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending']);
      expect(component.passkeyError()).toBeNull();
    });

    it('shows passkeyError on ACCOUNT_DISABLED without navigating', async () => {
      passkeyService.login.mockRejectedValue(
        new PasskeyError('ACCOUNT_DISABLED', 'Account is disabled')
      );

      await component.onPasskeyLogin();

      expect(component.passkeyError()).toBe('Account is disabled');
      expect(router.navigate).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('shows passkeyError when PasskeyError with non-CANCELLED code', async () => {
      passkeyService.login.mockRejectedValue(
        new PasskeyError('NETWORK_ERROR', 'Server unreachable')
      );

      await component.onPasskeyLogin();

      expect(component.passkeyError()).toBe('Server unreachable');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('shows generic error message for unknown errors', async () => {
      passkeyService.login.mockRejectedValue(new Error('Unexpected'));

      await component.onPasskeyLogin();

      expect(component.passkeyError()).toBe(
        'Passkey login failed. Please try again.'
      );
    });

    it('sets isPasskeyLoggingIn to true during login and clears it after', async () => {
      let resolveLogin!: (u: User) => void;
      passkeyService.login.mockReturnValue(
        new Promise<User>(res => {
          resolveLogin = res;
        })
      );

      const loginPromise = component.onPasskeyLogin();
      expect(component.isPasskeyLoggingIn()).toBe(true);

      resolveLogin(fakeUser);
      await loginPromise;
      expect(component.isPasskeyLoggingIn()).toBe(false);
    });

    it('clears isPasskeyLoggingIn even when login throws', async () => {
      passkeyService.login.mockRejectedValue(new Error('fail'));

      await component.onPasskeyLogin();

      expect(component.isPasskeyLoggingIn()).toBe(false);
    });

    it('isPasskeySupported reflects PasskeyService.isSupported()', () => {
      expect(component.isPasskeySupported).toBe(true);
    });

    it('isPasskeySupported is false when browser does not support passkeys', () => {
      passkeyService.isSupported.mockReturnValue(false);
      // Re-create so the field is captured at construction time
      fixture = TestBed.createComponent(LoginDialogComponent);
      component = fixture.componentInstance;
      expect(component.isPasskeySupported).toBe(false);
    });

    it('cancelPasskeyLogin delegates to passkeyService.abortLogin()', () => {
      component.cancelPasskeyLogin();
      expect(passkeyService.abortLogin).toHaveBeenCalledOnce();
    });
  });
});
