import { HttpClient, HttpErrorResponse, withXhr } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthenticationService, type User } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { of, throwError } from 'rxjs';
import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
} from 'vitest';

import { RegistrationFormComponent } from './registration-form.component';

/** Valid password meeting all policy requirements, used throughout this spec */
const VALID_PASSWORD = 'ValidPass123!';

const DEFAULT_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
};

describe('RegistrationFormComponent', () => {
  let component: RegistrationFormComponent;
  let fixture: ComponentFixture<RegistrationFormComponent>;
  let authService: MockedObject<AuthenticationService>;
  let userService: MockedObject<UserService>;
  let snackBar: MockedObject<MatSnackBar>;
  let setupService: MockedObject<SetupService>;
  let systemConfigService: {
    isRequireEmailEnabled: ReturnType<typeof vi.fn>;
    isPasswordLoginEnabled: ReturnType<typeof vi.fn>;
    passwordPolicy: ReturnType<typeof vi.fn>;
  };

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

    systemConfigService = {
      isRequireEmailEnabled: vi.fn().mockReturnValue(false),
      // Default to true so existing password-policy tests keep working;
      // passwordless-mode tests can flip this with `.mockReturnValue(false)`.
      isPasswordLoginEnabled: vi.fn().mockReturnValue(true),
      passwordPolicy: vi.fn().mockReturnValue(DEFAULT_POLICY),
    };

    await TestBed.configureTestingModule({
      imports: [RegistrationFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: AuthenticationService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
        { provide: SystemConfigService, useValue: systemConfigService },
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
      expect(component.model().username).toBe('');
      expect(component.model().password).toBe('');
      expect(component.model().confirmPassword).toBe('');
    });

    it('should have form controls with validators', () => {
      const usernameErrors = component.form.username().errors();
      const passwordErrors = component.form.password().errors();
      const confirmPasswordErrors = component.form.confirmPassword().errors();

      expect(usernameErrors.some(e => e.kind === 'required')).toBe(true);
      expect(passwordErrors.some(e => e.kind === 'required')).toBe(true);
      expect(confirmPasswordErrors.some(e => e.kind === 'required')).toBe(true);
    });

    it('should have optional display name and email controls', () => {
      expect(component.model().displayName).toBe('');
      expect(component.model().email).toBe('');
      // Not required by default
      expect(component.form.displayName().valid()).toBe(true);
      expect(component.form.email().valid()).toBe(true);
    });

    it('should require email when requireEmail is enabled', async () => {
      systemConfigService.isRequireEmailEnabled.mockReturnValue(true);
      // Trigger the validator update via re-creation (config is read in schema)
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [RegistrationFormComponent],
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(withXhr()),
          provideHttpClientTesting(),
          { provide: AuthenticationService, useValue: authService },
          { provide: UserService, useValue: userService },
          { provide: MatSnackBar, useValue: snackBar },
          { provide: SetupService, useValue: setupService },
          { provide: SystemConfigService, useValue: systemConfigService },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(RegistrationFormComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const emailErrors = component.form.email().errors();
      expect(emailErrors.some(e => e.kind === 'required')).toBe(true);
    });

    it('should validate email format', () => {
      component.form.email().value.set('not-an-email');
      expect(
        component.form
          .email()
          .errors()
          .some(e => e.kind === 'email')
      ).toBe(true);
      component.form.email().value.set('valid@example.com');
      expect(component.form.email().valid()).toBe(true);
    });
  });

  describe('password validation', () => {
    it('should validate password minimum length', () => {
      component.form.password().value.set('short');
      expect(
        component.form
          .password()
          .errors()
          .some(e => e.kind === 'minLength')
      ).toBe(true);
    });

    it('should update password requirements on password change', async () => {
      component.form.password().value.set('Test123!@');
      await fixture.whenStable();
      expect(component.passwordRequirements['minLength'].met).toBe(true);
      expect(component.passwordRequirements['uppercase'].met).toBe(true);
      expect(component.passwordRequirements['lowercase'].met).toBe(true);
      expect(component.passwordRequirements['number'].met).toBe(true);
      expect(component.passwordRequirements['special'].met).toBe(true);
    });

    it('should not meet requirements for weak password', () => {
      component.form.password().value.set('weak');
      expect(component.passwordRequirements['minLength'].met).toBe(false);
      expect(component.passwordRequirements['uppercase'].met).toBe(false);
      expect(component.passwordRequirements['number'].met).toBe(false);
      expect(component.passwordRequirements['special'].met).toBe(false);
    });

    it('should return true for isPasswordValid when all requirements are met', async () => {
      component.form.password().value.set(VALID_PASSWORD);
      await fixture.whenStable();
      expect(component.isPasswordValid()).toBe(true);
    });

    it('should return false for isPasswordValid when requirements are not met', () => {
      component.form.password().value.set('weak');
      expect(component.isPasswordValid()).toBe(false);
    });
  });

  describe('password match validation', () => {
    it('should show error when passwords do not match', () => {
      component.form.password().value.set(VALID_PASSWORD);
      component.form.confirmPassword().value.set('DifferentPass!');
      expect(
        component.form
          .confirmPassword()
          .errors()
          .some(e => e.kind === 'passwordMismatch')
      ).toBe(true);
    });

    it('should not show error when passwords match', () => {
      component.form.password().value.set(VALID_PASSWORD);
      component.form.confirmPassword().value.set(VALID_PASSWORD);
      expect(
        component.form
          .confirmPassword()
          .errors()
          .some(e => e.kind === 'passwordMismatch')
      ).toBe(false);
    });
  });

  describe('error message getters', () => {
    it('should return username required error', () => {
      component.form.username().markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe('Username is required');
    });

    it('should return username minlength error', () => {
      component.form.username().value.set('ab');
      component.form.username().markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe(
        'Username must be at least 3 characters'
      );
    });

    it('should return password required error', () => {
      component.form.password().markAsTouched();
      expect(component.getPasswordErrorMessage()).toBe('Password is required');
    });

    it('should return confirm password required error', () => {
      component.form.confirmPassword().markAsTouched();
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Please confirm your password'
      );
    });

    it('should return password mismatch error', () => {
      component.form.password().value.set(VALID_PASSWORD);
      component.form.confirmPassword().value.set('Different123!');
      component.form.confirmPassword().markAsTouched();
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Passwords do not match'
      );
    });
  });

  describe('username suggestions', () => {
    it('should select suggestion and update form', () => {
      component.usernameSuggestions = ['user123', 'user456'];
      component.selectSuggestion('user123');
      expect(component.model().username).toBe('user123');
      expect(component.usernameSuggestions).toEqual([]);
    });
  });

  describe('submit', () => {
    it('should not submit when form is invalid', async () => {
      await component.submit();
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should call authService.registerUser with correct data', async () => {
      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

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
        password: VALID_PASSWORD,
      });
    });

    it('should include name and email when provided', async () => {
      component.model.set({
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
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
        password: VALID_PASSWORD,
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should emit registered event on successful registration', async () => {
      const registeredSpy = vi.fn();
      component.registered.subscribe(registeredSpy);

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

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

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

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
      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

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

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

      await component.submit();

      expect(authService.registerUser).not.toHaveBeenCalled();
      expect(submitRequestSpy).toHaveBeenCalledWith({
        username: 'testuser',
        password: VALID_PASSWORD,
      });
    });
  });

  describe('username availability', () => {
    it('should check username availability successfully', async () => {
      // Provide server URL for the check
      component.serverUrl = 'https://test-server.example.com';
      component.form.username().value.set('newuser');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(of({ available: true }));

      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('available');
      expect(component.usernameSuggestions).toEqual([]);
    });

    it('should handle unavailable username with suggestions', async () => {
      // Provide server URL for the check
      component.serverUrl = 'https://test-server.example.com';
      component.form.username().value.set('taken');
      const httpClient = TestBed.inject(HttpClient);
      vi.spyOn(httpClient, 'get').mockReturnValue(
        of({ available: false, suggestions: ['taken1', 'taken2'] })
      );

      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('unavailable');
      expect(component.usernameSuggestions).toEqual(['taken1', 'taken2']);
      expect(component['usernameTaken']()).toBe(true);
    });

    it('should skip check when skipUsernameCheck is true', async () => {
      component.skipUsernameCheck = true;
      component.form.username().value.set('testuser');
      const httpClient = TestBed.inject(HttpClient);
      const getSpy = vi.spyOn(httpClient, 'get');

      await component.checkUsernameAvailability();

      expect(getSpy).not.toHaveBeenCalled();
    });

    it('should skip check when no server URL is available', async () => {
      // No serverUrl set and setupService returns empty string
      component.serverUrl = undefined;
      component.form.username().value.set('testuser');
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
      component.form.username().value.set('testuser');
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
      component.form.username().value.set('testuser');
      component.form.password().value.set('Password123!');

      const values = component.getFormValues();

      expect(values).toEqual({
        username: 'testuser',
        password: 'Password123!',
      });
    });

    it('should reset form', () => {
      component.form.username().value.set('testuser');
      component.form.password().value.set('Password123!');
      component.usernameAvailability = 'available';
      component.usernameSuggestions = ['test1', 'test2'];

      component.reset();

      expect(component.model().username).toBe('');
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

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });

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

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });
      fixture.detectChanges();

      await component.submit();

      expect(component.serverValidationErrors).toEqual({
        username: ['Username already taken'],
        password: ['Password is too weak'],
      });
      expect(component['usernameServerInvalid']()).toBe(true);
      expect(component['passwordServerInvalid']()).toBe(true);
    });

    it('should handle HttpErrorResponse without validation errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
      });

      authService.registerUser.mockReturnValue(throwError(() => httpError));

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });

    it('should handle non-HttpErrorResponse errors', async () => {
      authService.registerUser.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });

    it('should handle unknown error type', async () => {
      authService.registerUser.mockReturnValue(
        throwError(() => 'string error')
      );

      component.model.set({
        username: 'testuser',
        displayName: '',
        email: '',
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      });
      fixture.detectChanges();

      await component.submit();

      expect(component.isRegistering()).toBe(false);
    });
  });

  describe('passwordless mode', () => {
    beforeEach(async () => {
      systemConfigService.isPasswordLoginEnabled.mockReturnValue(false);
      // Re-create component so the passwordless flag is read at construction.
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [RegistrationFormComponent],
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(withXhr()),
          provideHttpClientTesting(),
          { provide: AuthenticationService, useValue: authService },
          { provide: UserService, useValue: userService },
          { provide: MatSnackBar, useValue: snackBar },
          { provide: SetupService, useValue: setupService },
          { provide: SystemConfigService, useValue: systemConfigService },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(RegistrationFormComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('exposes isPasswordLoginEnabled signal returning false', () => {
      expect(component.isPasswordLoginEnabled()).toBe(false);
    });

    it('clears password validators so the form can submit empty', () => {
      component.form.username().value.set('newuser');
      // No password / confirmPassword set
      expect(component.form.password().valid()).toBe(true);
      expect(component.form.confirmPassword().valid()).toBe(true);
      expect(component.form().valid()).toBe(true);
    });

    it('omits password from credentials on submit', async () => {
      const submitRequestSpy = vi.fn();
      component.submitRequest.subscribe(submitRequestSpy);
      component.externalSubmit = true;

      component.form.username().value.set('newuser');
      // Even if leftover text is in the password field, do not include it
      // when the flag is off — password login is disabled server-side.
      component.form.password().value.set('');

      await component.submit();

      expect(submitRequestSpy).toHaveBeenCalledWith({ username: 'newuser' });
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('omits password even if a stale value is in the password control', async () => {
      const submitRequestSpy = vi.fn();
      component.submitRequest.subscribe(submitRequestSpy);
      component.externalSubmit = true;

      component.form.username().value.set('newuser');
      // A stale password value: the gate checks the *flag* first, so this
      // should still be omitted even though formValues.password is truthy.
      component.form.password().value.set('LeftoverPass1!');

      await component.submit();

      const arg = submitRequestSpy.mock.calls[0][0];
      expect(arg).toEqual({ username: 'newuser' });
      expect(arg.password).toBeUndefined();
    });

    it('still includes name and email when provided in passwordless mode', async () => {
      const submitRequestSpy = vi.fn();
      component.submitRequest.subscribe(submitRequestSpy);
      component.externalSubmit = true;

      component.form.username().value.set('newuser');
      component.form.displayName().value.set('New User');
      component.form.email().value.set('new@example.com');

      await component.submit();

      expect(submitRequestSpy).toHaveBeenCalledWith({
        username: 'newuser',
        name: 'New User',
        email: 'new@example.com',
      });
    });
  });
});
