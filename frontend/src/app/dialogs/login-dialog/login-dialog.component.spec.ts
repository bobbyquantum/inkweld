import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { AuthenticationService } from '@inkweld/index';
import { UserService, UserServiceError } from '@services/user/user.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { LoginDialogComponent } from './login-dialog.component';

describe('LoginDialogComponent', () => {
  let component: LoginDialogComponent;
  let fixture: ComponentFixture<LoginDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<LoginDialogComponent>>;
  let userService: MockedObject<UserService>;
  let snackBar: MockedObject<MatSnackBar>;
  let authService: MockedObject<AuthenticationService>;
  let router: Router;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<LoginDialogComponent>>;

    userService = {
      login: vi.fn(),
    } as unknown as MockedObject<UserService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    authService = {
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

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
      component.providersLoaded = true;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should disable login button when providers not loaded', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = false;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should enable login button when form is valid and providers loaded', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
      expect(component.isLoginButtonDisabled()).toBe(false);
    });

    it('should disable login button when logging in', () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
      component.isLoggingIn = true;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });
  });

  describe('input change handlers', () => {
    it('should clear password error when username changes', () => {
      component.passwordError = 'Some error';
      component.onUsernameChange();
      expect(component.passwordError).toBeNull();
    });

    it('should clear lastAttemptedUsername when username differs from last attempt', () => {
      component.lastAttemptedUsername = 'olduser';
      component.username = 'newuser';
      component.onUsernameChange();
      expect(component.lastAttemptedUsername).toBe('');
    });

    it('should clear password error when password changes', () => {
      component.passwordError = 'Some error';
      component.onPasswordChange();
      expect(component.passwordError).toBeNull();
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

      expect(component.passwordError).toBe(
        'Please enter both username and password.'
      );
      expect(userService.login).not.toHaveBeenCalled();
    });

    it('should call userService.login with correct credentials', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
      userService.login.mockResolvedValue(undefined);

      await component.onLogin();

      expect(userService.login).toHaveBeenCalledWith('testuser', 'password123');
    });

    it('should close dialog on successful login', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
      userService.login.mockResolvedValue(undefined);

      await component.onLogin();

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should show success snackbar on successful login', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
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
      component.providersLoaded = true;
      userService.login.mockRejectedValue(
        new UserServiceError('LOGIN_FAILED', 'Invalid credentials')
      );

      await component.onLogin();

      expect(component.passwordError).toBe('Invalid username or password');
      expect(component.lastAttemptedPassword).toBe('wrongpassword');
    });

    it('should redirect to approval-pending on ACCOUNT_PENDING error', async () => {
      component.username = 'testuser';
      component.password = 'password123';
      component.providersLoaded = true;
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
      component.providersLoaded = true;

      let resolveLogin: () => void;
      const loginPromise = new Promise<void>(resolve => {
        resolveLogin = resolve;
      });
      userService.login.mockReturnValue(loginPromise);

      const loginPromiseResult = component.onLogin();
      expect(component.isLoggingIn).toBe(true);

      resolveLogin!();
      await loginPromiseResult;
      expect(component.isLoggingIn).toBe(false);
    });
  });

  describe('onRegisterClick', () => {
    it('should close dialog with "register" result', () => {
      component.onRegisterClick();
      expect(dialogRef.close).toHaveBeenCalledWith('register');
    });
  });
});
