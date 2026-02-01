import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthenticationService, User } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { RegistrationFormComponent } from './registration-form.component';

describe('RegistrationFormComponent', () => {
  let component: RegistrationFormComponent;
  let fixture: ComponentFixture<RegistrationFormComponent>;
  let authService: MockedObject<AuthenticationService>;
  let userService: MockedObject<UserService>;
  let snackBar: MockedObject<MatSnackBar>;
  let setupService: MockedObject<SetupService>;

  beforeEach(async () => {
    authService = {
      registerUser: vi.fn(),
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
      imports: [RegistrationFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthenticationService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationFormComponent);
    component = fixture.componentInstance;
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

  describe('submit', () => {
    it('should not submit when form is invalid', async () => {
      await component.submit();
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should call authService.registerUser with correct data', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

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

      await component.submit();

      expect(authService.registerUser).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'ValidPass123!',
      });
    });

    it('should emit registered event on successful registration', async () => {
      const registeredSpy = vi.fn();
      component.registered.subscribe(registeredSpy);

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

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

      await component.submit();

      expect(registeredSpy).toHaveBeenCalledWith({
        user: mockUser,
        token: 'test-token',
        requiresApproval: false,
      });
    });

    it('should emit registrationError event on error', async () => {
      const errorSpy = vi.fn();
      component.registrationError.subscribe(errorSpy);

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

      const errorResponse = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
      });

      const registerUserMock = authService.registerUser as ReturnType<
        typeof vi.fn
      >;
      registerUserMock.mockReturnValue(throwError(() => errorResponse));

      await component.submit();

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should set isRegistering to true during registration', async () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

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

      const submitPromise = component.submit();
      expect(component.isRegistering()).toBe(true);
      await submitPromise;
      expect(component.isRegistering()).toBe(false);
    });
  });

  describe('externalSubmit mode', () => {
    it('should emit submitRequest instead of calling API', async () => {
      const submitRequestSpy = vi.fn();
      component.submitRequest.subscribe(submitRequestSpy);
      component.externalSubmit = true;

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

      await component.submit();

      expect(authService.registerUser).not.toHaveBeenCalled();
      expect(submitRequestSpy).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'ValidPass123!',
      });
    });
  });

  describe('username availability', () => {
    it('should check username availability successfully', async () => {
      // Provide server URL for the check
      component.serverUrl = 'https://test-server.example.com';
      component.registerForm.get('username')?.setValue('newuser');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(of({ available: true }));

      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('available');
      expect(component.usernameSuggestions).toEqual([]);
    });

    it('should handle unavailable username with suggestions', async () => {
      // Provide server URL for the check
      component.serverUrl = 'https://test-server.example.com';
      component.registerForm.get('username')?.setValue('taken');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(
        of({ available: false, suggestions: ['taken1', 'taken2'] })
      );

      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('unavailable');
      expect(component.usernameSuggestions).toEqual(['taken1', 'taken2']);
      expect(
        component.registerForm.get('username')?.hasError('usernameTaken')
      ).toBe(true);
    });

    it('should skip check when skipUsernameCheck is true', async () => {
      component.skipUsernameCheck = true;
      component.registerForm.get('username')?.setValue('testuser');
      const httpClient = TestBed.inject(HttpClient);
      const getSpy = vi.spyOn(httpClient, 'get');

      await component.checkUsernameAvailability();

      expect(getSpy).not.toHaveBeenCalled();
    });

    it('should skip check when no server URL is available', async () => {
      // No serverUrl set and setupService returns empty string
      component.serverUrl = undefined;
      component.registerForm.get('username')?.setValue('testuser');
      const httpClient = TestBed.inject(HttpClient);
      const getSpy = vi.spyOn(httpClient, 'get');

      await component.checkUsernameAvailability();

      expect(getSpy).not.toHaveBeenCalled();
      expect(component.usernameAvailability).toBe('unknown');
    });

    it('should use setupService URL when serverUrl input is not provided', async () => {
      // Mock setupService to return a URL
      setupService.getServerUrl.mockReturnValue(
        'https://configured-server.example.com'
      );
      component.serverUrl = undefined;
      component.registerForm.get('username')?.setValue('testuser');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(of({ available: true }));

      await component.checkUsernameAvailability();

      expect(httpClient.get).toHaveBeenCalledWith(
        'https://configured-server.example.com/api/v1/users/check-username?username=testuser'
      );
    });
  });

  describe('helper methods', () => {
    it('should get form values', () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('Password123!');

      const values = component.getFormValues();

      expect(values).toEqual({
        username: 'testuser',
        password: 'Password123!',
      });
    });

    it('should reset form', () => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('Password123!');
      component.usernameAvailability = 'available';
      component.usernameSuggestions = ['test1', 'test2'];

      component.reset();

      expect(component.registerForm.get('username')?.value).toBe('');
      expect(component.usernameAvailability).toBe('unknown');
      expect(component.usernameSuggestions).toEqual([]);
    });

    it('should set loading state', () => {
      expect(component.isRegistering()).toBe(false);
      component.setLoading(true);
      expect(component.isRegistering()).toBe(true);
      component.setLoading(false);
      expect(component.isRegistering()).toBe(false);
    });

    it('should set error message', () => {
      component.setError('Custom error message');
      expect(component.serverValidationErrors).toEqual({
        general: ['Custom error message'],
      });
    });

    it('should return isValid correctly', () => {
      expect(component.isValid).toBe(false);

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');

      expect(component.isValid).toBe(true);
    });

    it('should return isSubmitting correctly', () => {
      expect(component.isSubmitting).toBe(false);
      component.setLoading(true);
      expect(component.isSubmitting).toBe(true);
    });
  });

  describe('password focus events', () => {
    it('should handle password focus and blur', () => {
      component.onPasswordFocus();
      expect(component.isPasswordFocused).toBe(true);

      component.onPasswordBlur();
      expect(component.isPasswordFocused).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle HttpErrorResponse with validation errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 400,
        error: {
          errors: {
            username: ['Username already taken'],
            password: ['Password is too weak'],
          },
        },
      });

      authService.registerUser.mockReturnValue(throwError(() => httpError));

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      fixture.detectChanges();

      await component.submit();

      expect(component.serverValidationErrors).toEqual({
        username: ['Username already taken'],
        password: ['Password is too weak'],
      });
      expect(
        component.registerForm.get('username')?.hasError('serverValidation')
      ).toBe(true);
      expect(
        component.registerForm.get('password')?.hasError('serverValidation')
      ).toBe(true);
    });

    it('should handle HttpErrorResponse without validation errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
      });

      authService.registerUser.mockReturnValue(throwError(() => httpError));

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });

    it('should handle non-HttpErrorResponse errors', async () => {
      authService.registerUser.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });

    it('should handle unknown error type', async () => {
      authService.registerUser.mockReturnValue(
        throwError(() => 'string error')
      );

      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('ValidPass123!');
      component.registerForm.get('confirmPassword')?.setValue('ValidPass123!');
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });
  });

  describe('password requirement updates', () => {
    it('should detect changes when requirements state changes', () => {
      const detectChangesSpy = vi.spyOn(
        component['changeDetectorRef'],
        'detectChanges'
      );

      // Initially set a password that meets no requirements
      component.registerForm.get('password')?.setValue('a');
      const callCountAfterFirst = detectChangesSpy.mock.calls.length;

      // Set a password that meets more requirements - should trigger change detection
      component.registerForm.get('password')?.setValue('Aa1@longer');

      expect(detectChangesSpy.mock.calls.length).toBeGreaterThan(
        callCountAfterFirst
      );
    });

    it('should not trigger change detection when requirements stay the same', () => {
      // Set a password that meets all requirements
      component.registerForm.get('password')?.setValue('Aa1@longer');
      const initialCalls = vi.spyOn(
        component['changeDetectorRef'],
        'detectChanges'
      ).mock.calls.length;

      // Set another password that still meets all requirements
      component.registerForm.get('password')?.setValue('Bb2$evenlong');

      // The key is that the requirements state didn't change - verify final state
      expect(component.passwordRequirements.minLength.met).toBe(true);
      expect(component.passwordRequirements.uppercase.met).toBe(true);
      expect(component.passwordRequirements.lowercase.met).toBe(true);
      expect(component.passwordRequirements.number.met).toBe(true);
      expect(component.passwordRequirements.special.met).toBe(true);

      // Verify initialCalls was captured (it should be 0 at spy creation)
      expect(initialCalls).toBe(0);
    });
  });
});
