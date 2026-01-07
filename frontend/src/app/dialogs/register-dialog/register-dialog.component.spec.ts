import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
} from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { AuthenticationService, User } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { RegisterDialogComponent } from './register-dialog.component';

describe('RegisterDialogComponent', () => {
  let component: RegisterDialogComponent;
  let fixture: ComponentFixture<RegisterDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<RegisterDialogComponent>>;
  let authService: MockedObject<AuthenticationService>;
  let userService: MockedObject<UserService>;
  let snackBar: MockedObject<MatSnackBar>;
  let setupService: MockedObject<SetupService>;
  let router: Router;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<RegisterDialogComponent>>;

    authService = {
      registerUser: vi.fn(),
      checkUsernameAvailability: vi.fn(),
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

    userService = {
      setCurrentUser: vi.fn(),
    } as unknown as MockedObject<UserService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    setupService = {
      getServerUrl: vi.fn().mockReturnValue(''),
    } as unknown as MockedObject<SetupService>;

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

  describe('form initialization', () => {
    it('should have empty form controls initially', () => {
      expect(component.registerForm.get('username')?.value).toBe('');
      expect(component.registerForm.get('password')?.value).toBe('');
      expect(component.registerForm.get('confirmPassword')?.value).toBe('');
    });

    it('should have form controls with validators', () => {
      const usernameControl = component.registerForm.get('username');
      const passwordControl = component.registerForm.get('password');
      const confirmPasswordControl =
        component.registerForm.get('confirmPassword');

      expect(usernameControl?.hasError('required')).toBe(true);
      expect(passwordControl?.hasError('required')).toBe(true);
      expect(confirmPasswordControl?.hasError('required')).toBe(true);
    });
  });

  describe('password validation', () => {
    it('should validate password minimum length', () => {
      component.registerForm.get('password')?.setValue('short');
      expect(
        component.registerForm.get('password')?.hasError('minlength')
      ).toBe(true);
    });

    it('should update password requirements on password change', () => {
      component.registerForm.get('password')?.setValue('Test123!@');
      expect(component.passwordRequirements.minLength.met).toBe(true);
      expect(component.passwordRequirements.uppercase.met).toBe(true);
      expect(component.passwordRequirements.lowercase.met).toBe(true);
      expect(component.passwordRequirements.number.met).toBe(true);
      expect(component.passwordRequirements.special.met).toBe(true);
    });

    it('should not meet requirements for weak password', () => {
      component.registerForm.get('password')?.setValue('weak');
      expect(component.passwordRequirements.minLength.met).toBe(false);
      expect(component.passwordRequirements.uppercase.met).toBe(false);
      expect(component.passwordRequirements.number.met).toBe(false);
      expect(component.passwordRequirements.special.met).toBe(false);
    });

    it('should validate password min length', () => {
      const control = component.passwordControl;
      control?.setValue('Short1!');
      expect(control?.hasError('minLength')).toBe(true);
    });

    it('should return true for isPasswordValid when all requirements are met', () => {
      component.registerForm.get('password')?.setValue('ValidPass123!');
      expect(component.isPasswordValid()).toBe(true);
    });

    it('should return false for isPasswordValid when requirements are not met', () => {
      component.registerForm.get('password')?.setValue('weak');
      expect(component.isPasswordValid()).toBe(false);
    });
  });

  describe('password match validation', () => {
    it('should show error when passwords do not match', () => {
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('DifferentPass!');
      expect(component.registerForm.hasError('passwordMismatch')).toBe(true);
    });

    it('should not show error when passwords match', () => {
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      expect(component.registerForm.hasError('passwordMismatch')).toBe(false);
    });
  });

  describe('error message getters', () => {
    it('should return username required error', () => {
      component.registerForm.get('username')?.markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe('Username is required');
    });

    it('should return username minlength error', () => {
      component.registerForm.get('username')?.setValue('ab');
      component.registerForm.get('username')?.markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe(
        'Username must be at least 3 characters'
      );
    });

    it('should return password mismatch error', () => {
      component.confirmPasswordControl!.setValue('password123');
      component.registerForm.setErrors({ passwordMismatch: true });
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Passwords do not match'
      );
    });

    it('should return password required error', () => {
      component.registerForm.get('password')?.markAsTouched();
      expect(component.getPasswordErrorMessage()).toBe('Password is required');
    });

    it('should return confirm password required error', () => {
      component.registerForm.get('confirmPassword')?.markAsTouched();
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Please confirm your password'
      );
    });

    it('should return password mismatch error', () => {
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('Different123!');
      component.registerForm.get('confirmPassword')?.markAsTouched();
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Passwords do not match'
      );
    });
  });

  describe('username suggestions', () => {
    it('should select suggestion and update form', () => {
      component.usernameSuggestions = ['user123', 'user456'];
      component.selectSuggestion('user123');
      expect(component.registerForm.get('username')?.value).toBe('user123');
      expect(component.usernameSuggestions).toEqual([]);
    });
  });

  describe('onRegister', () => {
    it('should not register when form is invalid', async () => {
      await component.onRegister();
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should not register when providers are not loaded', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(false);

      await component.onRegister();
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should call authService.registerUser with correct data', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: true,
      };

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(
        of({
          message: 'Registration successful',
          user: mockUser,
          token: 'test-token',
          requiresApproval: false,
        })
      );

      await component.onRegister();

      expect(authService.registerUser).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'ValidPass123!',
      });
    });

    it('should close dialog and navigate on successful registration', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: true,
      };

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(
        of({
          message: 'Registration successful',
          user: mockUser,
          token: 'test-token',
          requiresApproval: false,
        })
      );

      await component.onRegister();

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration successful!',
        'Close',
        { duration: 3000 }
      );
    });

    it('should redirect to approval-pending when approval is required', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: false,
        approved: false,
      };

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(
        of({
          message: 'Registration pending',
          user: mockUser,
          requiresApproval: true,
        })
      );

      await component.onRegister();

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending'], {
        queryParams: {
          username: 'testuser',
          name: 'testuser',
          userId: '1',
        },
      });
    });

    it('should set isRegistering to true during registration', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: true,
      };

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(
        of({
          message: 'Registration successful',
          user: mockUser,
          token: 'test-token',
          requiresApproval: false,
        })
      );

      const registerPromise = component.onRegister();
      // isRegistering should be true immediately after calling
      expect(component.isRegistering()).toBe(true);
      await registerPromise;
      expect(component.isRegistering()).toBe(false);
    });

    it('should handle server validation errors', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const errorResponse = new HttpErrorResponse({
        error: {
          errors: {
            username: ['Username already exists'],
          },
        },
        status: 400,
      });

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(throwError(() => errorResponse));

      await component.onRegister();

      expect(component.serverValidationErrors).toEqual({
        username: ['Username already exists'],
      });
      expect(
        component.registerForm.get('username')?.hasError('serverValidation')
      ).toBe(true);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Please fix the validation errors',
        'Close',
        { duration: 5000 }
      );
    });

    it('should handle general server errors', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const errorResponse = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
      });

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(throwError(() => errorResponse));

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Registration failed'),
        'Close',
        { duration: 5000 }
      );
    });

    it('should handle unknown errors', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      component.providersLoaded.set(true);

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(throwError(() => new Error('Unknown')));

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        'An unknown error occurred during registration. Please try again.',
        'Close',
        { duration: 5000 }
      );
    });

    it('should show snackbar on password mismatch during registration', async () => {
      component.registerForm.patchValue({
        password: 'Password1!',
        confirmPassword: 'DifferentPassword1!',
      });
      component.registerForm.setErrors({ passwordMismatch: true });

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Passwords do not match',
        'Close',
        { duration: 3000 }
      );
    });
  });

  describe('username availability', () => {
    it('should check username availability successfully', async () => {
      component.registerForm.get('username')?.setValue('newuser');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(of({ available: true }));

      await component.checkUsernameAvailability();

      // Wait for setTimeout
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.usernameAvailability).toBe('available');
      expect(component.usernameSuggestions).toEqual([]);
    });

    it('should handle unavailable username with suggestions', async () => {
      component.registerForm.get('username')?.setValue('taken');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(
        of({ available: false, suggestions: ['taken1', 'taken2'] })
      );

      await component.checkUsernameAvailability();

      // Wait for setTimeout
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.usernameAvailability).toBe('unavailable');
      expect(component.usernameSuggestions).toEqual(['taken1', 'taken2']);
      expect(
        component.registerForm.get('username')?.hasError('usernameTaken')
      ).toBe(true);
    });

    it('should handle error during username check', async () => {
      component.registerForm.get('username')?.setValue('erroruser');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              statusText: 'Network error',
              status: 0,
            })
        )
      );

      await component.checkUsernameAvailability();

      // Wait for setTimeout
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(component.usernameAvailability).toBe('unknown');
      expect(snackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('Error checking username'),
        'Close',
        { duration: 3000 }
      );
    });

    it('should reset availability when username changes', () => {
      component.usernameAvailability = 'available';
      component.registerForm.get('username')?.setValue('changed');
      expect(component.usernameAvailability).toBe('unknown');
    });
  });

  describe('UI interactions', () => {
    it('should handle login click', () => {
      component.onLoginClick();
      expect(dialogRef.close).toHaveBeenCalledWith('login');
    });

    it('should handle providers loaded', () => {
      component.onProvidersLoaded();
      // Signal handles change detection properly, no setTimeout needed
      expect(component.providersLoaded()).toBe(true);
    });

    it('should handle password focus and blur', () => {
      component.onPasswordFocus();
      expect(component.isPasswordFocused).toBe(true);

      component.onPasswordBlur();
      expect(component.isPasswordFocused).toBe(false);
    });
  });
});
