import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import {
  AuthenticationService,
  User,
  UsernameAvailability,
  UsersService,
} from '@inkweld/index';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { XsrfService } from '@services/auth/xsrf.service';
import { of, throwError } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { RegisterComponent } from './register.component';

vi.mock('@angular/common/http');
vi.mock('@angular/router');
vi.mock('@services/xsrf.service');

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let httpClient: MockedObject<HttpClient>;
  let router: MockedObject<Router>;
  let snackBar: MockedObject<MatSnackBar>;
  let userService: MockedObject<UsersService>;
  let authService: MockedObject<AuthenticationService>;
  let xsrfService: MockedObject<XsrfService>;
  let userAuthService: MockedObject<UserService>;
  let systemConfigService: MockedObject<SystemConfigService>;

  beforeEach(async () => {
    httpClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as MockedObject<HttpClient>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    userService = {
      checkUsernameAvailability: vi.fn(),
    } as unknown as MockedObject<UsersService>;

    authService = {
      registerUser: vi.fn(),
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

    xsrfService = {
      getXsrfToken: vi.fn().mockReturnValue('mock-xsrf-token'),
    } as unknown as MockedObject<XsrfService>;

    userAuthService = {
      loadCurrentUser: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<UserService>;

    systemConfigService = {
      isCaptchaEnabled: vi.fn().mockReturnValue(false),
      isConfigLoaded: vi.fn().mockReturnValue(true),
      captchaSiteKey: vi.fn().mockReturnValue('test-site-key'),
    } as unknown as MockedObject<SystemConfigService>;

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: UsersService, useValue: userService },
        { provide: AuthenticationService, useValue: authService },
        { provide: XsrfService, useValue: xsrfService },
        { provide: UserService, useValue: userAuthService },
        { provide: SystemConfigService, useValue: systemConfigService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set isMobile based on window width', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 400,
    });

    void component.ngOnInit();
    expect(component.isMobile).toBeTruthy();

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    void component.ngOnInit();
    expect(component.isMobile).toBeFalsy();
  });

  describe('form validation', () => {
    it('should validate form correctly', () => {
      // Empty form should be invalid
      expect(component.registerForm.valid).toBeFalsy();

      // Form with just username should be invalid
      component.registerForm.get('username')?.setValue('testuser');
      expect(component.registerForm.valid).toBeFalsy();

      // Form with username and password should be invalid without confirmPassword
      component.registerForm.get('password')?.setValue('Test123@');
      expect(component.registerForm.valid).toBeFalsy();

      // Form with mismatched passwords should be invalid
      component.registerForm.get('confirmPassword')?.setValue('password456');
      expect(component.registerForm.valid).toBeFalsy();

      // Form with matching passwords should be valid
      component.registerForm.get('confirmPassword')?.setValue('Test123@');
      expect(component.registerForm.valid).toBeTruthy();
    });

    it('should have appropriate error messages for form controls', () => {
      // Username required
      component.registerForm.get('username')?.setValue('');
      component.registerForm.get('username')?.markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe('Username is required');

      // Username too short
      component.registerForm.get('username')?.setValue('ab');
      component.registerForm.get('username')?.markAsTouched();
      expect(component.getUsernameErrorMessage()).toBe(
        'Username must be at least 3 characters'
      );

      // Username taken
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm
        .get('username')
        ?.setErrors({ usernameTaken: true });
      expect(component.getUsernameErrorMessage()).toBe(
        'Username already taken. Please choose another.'
      );

      // Password required
      component.registerForm.get('password')?.setValue('');
      component.registerForm.get('password')?.markAsTouched();
      expect(component.getPasswordErrorMessage()).toBe('Password is required');

      // Password too short
      component.registerForm.get('password')?.setValue('1234');
      component.registerForm.get('password')?.markAsTouched();
      expect(component.getPasswordErrorMessage()).toBe(
        'Password must be at least 8 characters'
      );

      // Confirm password required
      component.registerForm.get('confirmPassword')?.setValue('');
      component.registerForm.get('confirmPassword')?.markAsTouched();
      expect(component.getConfirmPasswordErrorMessage()).toBe(
        'Please confirm your password'
      );
    });

    it('should detect password mismatch', () => {
      component.registerForm.get('password')?.setValue('password123');
      component.registerForm.get('confirmPassword')?.setValue('password456');
      expect(component.registerForm.hasError('passwordMismatch')).toBeTruthy();

      // Fix the mismatch
      component.registerForm.get('confirmPassword')?.setValue('password123');
      expect(component.registerForm.hasError('passwordMismatch')).toBeFalsy();
    });
  });

  describe('username availability', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should check username availability when username is valid', async () => {
      const mockResponse: UsernameAvailability = {
        available: true,
        suggestions: [],
      };
      httpClient.get.mockReturnValue(of(mockResponse));

      component.registerForm.get('username')?.setValue('testuser');
      await component.checkUsernameAvailability();
      vi.runAllTimers();

      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/users/check-username?username=testuser'
      );
      expect(component.usernameAvailability).toBe('available');
      expect(component.usernameSuggestions).toEqual([]);
      expect(component.registerForm.get('username')?.errors).toBeNull();
    });

    it('should mark username as unavailable when taken', async () => {
      const mockResponse: UsernameAvailability = {
        available: false,
        suggestions: ['testuser1', 'testuser2'],
      };
      httpClient.get.mockReturnValue(of(mockResponse));

      component.registerForm.get('username')?.setValue('testuser');
      await component.checkUsernameAvailability();
      vi.runAllTimers();

      expect(component.usernameAvailability).toBe('unavailable');
      expect(component.usernameSuggestions).toEqual(['testuser1', 'testuser2']);
      expect(
        component.registerForm.get('username')?.hasError('usernameTaken')
      ).toBeTruthy();
    });

    it('should not check availability for username shorter than 3 characters', async () => {
      component.registerForm.get('username')?.setValue('te');
      await component.checkUsernameAvailability();

      expect(userService.checkUsernameAvailability).not.toHaveBeenCalled();
      expect(component.usernameAvailability).toBe('unknown');
    });

    it('should handle username availability check error', async () => {
      vi.useFakeTimers();
      httpClient.get.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      component.registerForm.get('username')?.setValue('testuser');
      await component.checkUsernameAvailability();
      vi.runAllTimers();

      expect(component.usernameAvailability).toBe('unknown');
      expect(snackBar.open).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should select a suggested username', () => {
      const mockResponse: UsernameAvailability = {
        available: true,
        suggestions: [],
      };
      httpClient.get.mockReturnValue(of(mockResponse));

      component.selectSuggestion('suggested_username');

      expect(component.registerForm.get('username')?.value).toBe(
        'suggested_username'
      );
      expect(httpClient.get).toHaveBeenCalledWith(
        '/api/v1/users/check-username?username=suggested_username'
      );
    });
  });

  describe('password validation', () => {
    it('should initialize password requirements as not met', () => {
      expect(
        Object.values(component.passwordRequirements).every(req => !req.met)
      ).toBe(true);
    });

    it('should update password requirements when password changes', () => {
      const password = 'Test123@';
      component.registerForm.get('password')?.setValue(password);

      expect(component.passwordRequirements.minLength.met).toBe(true);
      expect(component.passwordRequirements.uppercase.met).toBe(true);
      expect(component.passwordRequirements.lowercase.met).toBe(true);
      expect(component.passwordRequirements.number.met).toBe(true);
      expect(component.passwordRequirements.special.met).toBe(true);
    });

    it('should validate minimum length requirement', () => {
      const shortPassword = 'Test1@';
      component.registerForm.get('password')?.setValue(shortPassword);

      expect(component.passwordRequirements.minLength.met).toBe(false);
      expect(
        component.registerForm.get('password')?.errors?.['minLength']
      ).toBeTruthy();
    });

    it('should validate uppercase requirement', () => {
      const noUppercase = 'test123@';
      component.registerForm.get('password')?.setValue(noUppercase);

      expect(component.passwordRequirements.uppercase.met).toBe(false);
      expect(
        component.registerForm.get('password')?.errors?.['uppercase']
      ).toBeTruthy();
    });

    it('should validate lowercase requirement', () => {
      const noLowercase = 'TEST123@';
      component.registerForm.get('password')?.setValue(noLowercase);

      expect(component.passwordRequirements.lowercase.met).toBe(false);
      expect(
        component.registerForm.get('password')?.errors?.['lowercase']
      ).toBeTruthy();
    });

    it('should validate number requirement', () => {
      const noNumber = 'TestTest@';
      component.registerForm.get('password')?.setValue(noNumber);

      expect(component.passwordRequirements.number.met).toBe(false);
      expect(
        component.registerForm.get('password')?.errors?.['number']
      ).toBeTruthy();
    });

    it('should validate special character requirement', () => {
      const noSpecial = 'Test1234';
      component.registerForm.get('password')?.setValue(noSpecial);

      expect(component.passwordRequirements.special.met).toBe(false);
      expect(
        component.registerForm.get('password')?.errors?.['special']
      ).toBeTruthy();
    });

    it('should consider password valid when all requirements are met', () => {
      const validPassword = 'Test123@';
      component.registerForm.get('password')?.setValue(validPassword);

      expect(component.isPasswordValid()).toBe(true);
      expect(component.registerForm.get('password')?.errors).toBeNull();
    });

    it('should handle password with multiple missing requirements', () => {
      const weakPassword = 'test';
      component.registerForm.get('password')?.setValue(weakPassword);

      const errors = component.registerForm.get('password')?.errors || {};
      expect(Object.keys(errors).length).toBeGreaterThan(1);
      expect(component.isPasswordValid()).toBe(false);
    });
  });

  describe('registration', () => {
    beforeEach(() => {
      component.registerForm.get('username')?.setValue('testuser');
      component.registerForm.get('password')?.setValue('Test123@');
      component.registerForm.get('confirmPassword')?.setValue('Test123@');
      component.usernameAvailability = 'available';
      component.providersLoaded = true; // Simulate providers loaded
    });

    it('should not submit if form is invalid', async () => {
      // Make the form invalid
      component.registerForm.get('password')?.setValue('');

      await component.onRegister();

      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should show error for password mismatch', async () => {
      component.registerForm.get('confirmPassword')?.setValue('password456');

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Passwords do not match',
        'Close',
        expect.any(Object)
      );
      expect(authService.registerUser).not.toHaveBeenCalled();
    });

    it('should successfully register user', async () => {
      const registerUserMock = authService.registerUser as any;

      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: '',
        enabled: true,
      };

      registerUserMock.mockReturnValue(of(mockUser));

      await component.onRegister();

      expect(authService.registerUser).toHaveBeenCalledWith({
        username: 'testuser',
        password: 'Test123@',
        captchaToken: undefined,
      });

      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration successful!',
        'Close',
        expect.any(Object)
      );

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should handle registration error', async () => {
      const registerUserMock = authService.registerUser as any;
      const errorResponse = new HttpErrorResponse({
        error: 'Registration failed',
        status: 400,
        statusText: 'Bad Request',
      });
      registerUserMock.mockReturnValue(throwError(() => errorResponse));

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        `Registration failed: ${errorResponse.message}`,
        'Close',
        expect.any(Object)
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should handle unknown registration error', async () => {
      const registerUserMock = authService.registerUser as any;
      registerUserMock.mockReturnValue(
        throwError(() => new Error('Unknown error'))
      );

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        'An unknown error occurred during registration. Please try again.',
        'Close',
        expect.any(Object)
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should reset isRegistering flag after registration attempt', async () => {
      const registerUserMock = authService.registerUser as any;

      // Success case
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: '',
        enabled: true,
      };

      registerUserMock.mockReturnValue(of(mockUser));

      await component.onRegister();
      expect(component.isRegistering).toBeFalsy();

      // Error case
      registerUserMock.mockReturnValue(
        throwError(() => new Error('Test error'))
      );

      await component.onRegister();
      expect(component.isRegistering).toBeFalsy();
    });
  });
});
