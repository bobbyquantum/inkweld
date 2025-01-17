import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { UserService } from '@services/user.service';
import { XsrfService } from '@services/xsrf.service';
import {
  UserAPIService,
  UserControllerCheckUsernameAvailability200Response,
  UserDto,
  UserRegisterDto,
} from '@worm/index';
import { Observable, of, throwError } from 'rxjs';

import { RegisterComponent } from './register.component';

jest.mock('@angular/common/http');
jest.mock('@angular/router');
jest.mock('@services/xsrf.service');

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let httpClient: jest.Mocked<HttpClient>;
  let router: jest.Mocked<Router>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let userService: jest.Mocked<UserAPIService>;
  let xsrfService: jest.Mocked<XsrfService>;
  let userAuthService: jest.Mocked<UserService>;

  beforeEach(async () => {
    httpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    router = {
      navigate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    userService = {
      userControllerRegister: jest.fn(),
      userControllerCheckUsernameAvailability: jest.fn(),
    } as unknown as jest.Mocked<UserAPIService>;

    xsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('mock-xsrf-token'),
    } as unknown as jest.Mocked<XsrfService>;

    userAuthService = {
      loadCurrentUser: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<UserService>;

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, NoopAnimationsModule],
      providers: [
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: UserAPIService, useValue: userService },
        { provide: XsrfService, useValue: xsrfService },
        { provide: UserService, useValue: userAuthService },
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

  describe('password validation', () => {
    it('should show error when passwords do not match', async () => {
      component.password = 'password123';
      component.confirmPassword = 'password456';

      await component.onRegister();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Passwords do not match',
        'Close',
        expect.any(Object)
      );
      expect(userService.userControllerRegister).not.toHaveBeenCalled();
    });
  });

  describe('username availability', () => {
    it('should check username availability when username length >= 3', async () => {
      const checkUsernameAvailabilityMock =
        userService.userControllerCheckUsernameAvailability as unknown as jest.MockedFunction<
          (
            username: string,
            observe: 'body'
          ) => Observable<UserControllerCheckUsernameAvailability200Response>
        >;
      const mockResponse: UserControllerCheckUsernameAvailability200Response = {
        available: true,
        suggestions: [],
      };
      checkUsernameAvailabilityMock.mockReturnValue(of(mockResponse));

      component.username = 'testuser';
      await component.checkUsernameAvailability();

      expect(
        userService.userControllerCheckUsernameAvailability
      ).toHaveBeenCalledWith('testuser');
      expect(component.usernameAvailability).toBe('available');
      expect(component.usernameSuggestions).toEqual([]);
    });

    it('should handle unavailable username', async () => {
      const checkUsernameAvailabilityMock =
        userService.userControllerCheckUsernameAvailability as unknown as jest.MockedFunction<
          (
            username: string,
            observe: 'body'
          ) => Observable<UserControllerCheckUsernameAvailability200Response>
        >;
      const mockResponse: UserControllerCheckUsernameAvailability200Response = {
        available: false,
        suggestions: ['testuser1', 'testuser2'],
      };
      checkUsernameAvailabilityMock.mockReturnValue(of(mockResponse));

      component.username = 'testuser';
      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('unavailable');
      expect(component.usernameSuggestions).toEqual(['testuser1', 'testuser2']);
    });

    it('should not check availability for username shorter than 3 characters', () => {
      component.username = 'te';
      void component.checkUsernameAvailability();

      expect(
        userService.userControllerCheckUsernameAvailability
      ).not.toHaveBeenCalled();
      expect(component.usernameAvailability).toBe('unknown');
    });

    it('should handle username availability check error', async () => {
      const checkUsernameAvailabilityMock =
        userService.userControllerCheckUsernameAvailability as unknown as jest.MockedFunction<
          (
            username: string,
            observe: 'body'
          ) => Observable<UserControllerCheckUsernameAvailability200Response>
        >;
      checkUsernameAvailabilityMock.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      component.username = 'testuser';
      await component.checkUsernameAvailability();

      expect(component.usernameAvailability).toBe('unknown');
    });
  });

  describe('registration', () => {
    beforeEach(() => {
      component.username = 'testuser';
      component.name = 'Test User';
      component.email = 'test@example.com';
      component.password = 'password123';
      component.confirmPassword = 'password123';
    });

    it('should successfully register user', async () => {
      const registerUserMock =
        userService.userControllerRegister as unknown as jest.MockedFunction<
          (
            request: UserRegisterDto,
            token: string,
            observe: 'body'
          ) => Observable<UserDto>
        >;
      const mockUser: UserDto = {
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: '',
      };
      registerUserMock.mockReturnValue(of(mockUser));

      await component.onRegister();

      expect(userService.userControllerRegister).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
        username: 'testuser',
      });
      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration successful!',
        'Close',
        expect.any(Object)
      );
      expect(userAuthService.loadCurrentUser).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should handle registration error', async () => {
      const registerUserMock =
        userService.userControllerRegister as unknown as jest.MockedFunction<
          (
            request: UserRegisterDto,
            token: string,
            observe: 'body'
          ) => Observable<UserDto>
        >;
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
      const registerUserMock =
        userService.userControllerRegister as unknown as jest.MockedFunction<
          (
            request: UserRegisterDto,
            token: string,
            observe: 'body'
          ) => Observable<UserDto>
        >;
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
  });
});
