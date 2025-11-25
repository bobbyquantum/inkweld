import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService, UserServiceError } from '@services/user/user.service';
import { XsrfService } from '@services/auth/xsrf.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { WelcomeComponent } from './welcome.component';

vi.mock('@angular/common/http');
vi.mock('@angular/router');
vi.mock('@services/xsrf.service');

describe('WelcomeComponent', () => {
  let component: WelcomeComponent;
  let fixture: ComponentFixture<WelcomeComponent>;
  let httpClient: MockedObject<HttpClient>;
  let router: MockedObject<Router>;
  let snackBar: MockedObject<MatSnackBar>;
  let xsrfService: MockedObject<XsrfService>;
  let userService: MockedObject<UserService>;
  let breakpointObserver: MockedObject<BreakpointObserver>;

  beforeEach(async () => {
    httpClient = {
      post: vi.fn(),
    } as unknown as MockedObject<HttpClient>;

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    } as unknown as MockedObject<Router>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    xsrfService = {
      getXsrfToken: vi.fn().mockReturnValue('mock-xsrf-token'),
    } as unknown as MockedObject<XsrfService>;

    userService = {
      login: vi.fn(),
    } as unknown as MockedObject<UserService>;

    breakpointObserver = {
      observe: vi.fn().mockReturnValue(of({ matches: false })),
    } as unknown as MockedObject<BreakpointObserver>;

    await TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: {} } },
        },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: XsrfService, useValue: xsrfService },
        { provide: UserService, useValue: userService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the logo image', () => {
    const logoElement = fixture.nativeElement.querySelector('.logo-image');
    expect(logoElement).toBeTruthy();
    expect(logoElement.src).toContain('logo.png');
    expect(logoElement.alt).toBe('Inkweld Logo');
  });

  describe('onUsernameChange', () => {
    it('should clear passwordError when username changes', () => {
      component.passwordError = 'Some error';
      component.onUsernameChange();
      expect(component.passwordError).toBeNull();
    });

    it('should clear lastAttemptedUsername when username is different', () => {
      component.lastAttemptedUsername = 'olduser';
      component.username = 'newuser';
      component.onUsernameChange();
      expect(component.lastAttemptedUsername).toBe('');
    });

    it('should not clear lastAttemptedUsername when username matches', () => {
      component.lastAttemptedUsername = 'sameuser';
      component.username = 'sameuser';
      component.onUsernameChange();
      expect(component.lastAttemptedUsername).toBe('sameuser');
    });
  });

  describe('onPasswordChange', () => {
    it('should clear passwordError when password changes', () => {
      component.passwordError = 'Some error';
      component.onPasswordChange();
      expect(component.passwordError).toBeNull();
    });

    it('should clear lastAttemptedPassword when password is different', () => {
      component.lastAttemptedPassword = 'oldpass';
      component.password = 'newpass';
      component.onPasswordChange();
      expect(component.lastAttemptedPassword).toBe('');
    });

    it('should not clear lastAttemptedPassword when password matches', () => {
      component.lastAttemptedPassword = 'samepass';
      component.password = 'samepass';
      component.onPasswordChange();
      expect(component.lastAttemptedPassword).toBe('samepass');
    });
  });

  describe('isFormValid', () => {
    it('should return false when username is empty', () => {
      component.username = '';
      component.password = 'testpass';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return false when password is empty', () => {
      component.username = 'testuser';
      component.password = '';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return false when username is whitespace only', () => {
      component.username = '   ';
      component.password = 'testpass';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return false when password is whitespace only', () => {
      component.username = 'testuser';
      component.password = '   ';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return false when password matches last failed attempt', () => {
      component.username = 'testuser';
      component.password = 'failedpass';
      component.lastAttemptedPassword = 'failedpass';
      expect(component.isFormValid()).toBe(false);
    });

    it('should return true when password is different from last failed attempt', () => {
      component.username = 'testuser';
      component.password = 'newpass';
      component.lastAttemptedPassword = 'failedpass';
      expect(component.isFormValid()).toBe(true);
    });

    it('should return true when all fields are valid', () => {
      component.username = 'testuser';
      component.password = 'testpass';
      component.lastAttemptedPassword = '';
      expect(component.isFormValid()).toBe(true);
    });
  });

  describe('isLoginButtonDisabled', () => {
    it('should return true when form is invalid', () => {
      component.username = '';
      component.password = '';
      component.isLoggingIn = false;
      component.providersLoaded = true;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should return true when logging in', () => {
      component.username = 'testuser';
      component.password = 'testpass';
      component.isLoggingIn = true;
      component.providersLoaded = true;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should return true when providers not loaded', () => {
      component.username = 'testuser';
      component.password = 'testpass';
      component.isLoggingIn = false;
      component.providersLoaded = false;
      expect(component.isLoginButtonDisabled()).toBe(true);
    });

    it('should return false when form is valid, not logging in, and providers loaded', () => {
      component.username = 'testuser';
      component.password = 'testpass';
      component.isLoggingIn = false;
      component.providersLoaded = true;
      expect(component.isLoginButtonDisabled()).toBe(false);
    });
  });

  describe('onLogin', () => {
    beforeEach(() => {
      component.username = 'testuser';
      component.password = 'testpass';
      component.providersLoaded = true;
    });

    it('should handle successful login', async () => {
      userService.login.mockResolvedValue();

      await component.onLogin();

      expect(userService.login).toHaveBeenCalledWith('testuser', 'testpass');
    });

    it('should set isLoggingIn to true during login', async () => {
      userService.login.mockImplementation(
        () =>
          new Promise(resolve => {
            expect(component.isLoggingIn).toBe(true);
            resolve();
          })
      );

      await component.onLogin();

      expect(component.isLoggingIn).toBe(false);
    });

    it('should set passwordError and not call service when form is invalid', async () => {
      component.username = '';
      component.password = '';

      await component.onLogin();

      expect(component.passwordError).toBe(
        'Please enter both username and password.'
      );
      expect(userService.login).not.toHaveBeenCalled();
    });

    it('should show error message for invalid credentials', async () => {
      const error = new UserServiceError('LOGIN_FAILED', 'Login failed');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Invalid username or password. Please check your credentials.',
        'Close',
        {
          duration: 5000,
          panelClass: ['error-snackbar'],
        }
      );
    });

    it('should set lastAttemptedUsername and lastAttemptedPassword on LOGIN_FAILED', async () => {
      const error = new UserServiceError('LOGIN_FAILED', 'Login failed');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(component.lastAttemptedUsername).toBe('testuser');
      expect(component.lastAttemptedPassword).toBe('testpass');
    });

    it('should set passwordError on LOGIN_FAILED', async () => {
      const error = new UserServiceError('LOGIN_FAILED', 'Login failed');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(component.passwordError).toBe(
        'Invalid username or password. Please check your credentials.'
      );
    });

    it('should redirect to approval-pending on ACCOUNT_PENDING', async () => {
      const error = new UserServiceError('ACCOUNT_PENDING', 'Account pending');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending']);
      expect(component.passwordError).toBeNull();
    });

    it('should show error message for other UserServiceError', async () => {
      const error = new UserServiceError('SERVER_ERROR', 'Server error');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(snackBar.open).toHaveBeenCalledWith('Server error', 'Close', {
        duration: 5000,
      });
    });

    it('should show generic error message for unexpected errors', async () => {
      const error = new Error('Unexpected error');
      userService.login.mockRejectedValue(error);

      await component.onLogin();

      expect(snackBar.open).toHaveBeenCalledWith(
        'An unexpected error occurred during login.',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('onProvidersLoaded', () => {
    it('should set providersLoaded to true after timeout', async () => {
      vi.useFakeTimers();

      component.providersLoaded = false;
      component.onProvidersLoaded();

      expect(component.providersLoaded).toBe(false);

      await vi.advanceTimersByTimeAsync(0);

      expect(component.providersLoaded).toBe(true);

      vi.useRealTimers();
    });
  });
});
