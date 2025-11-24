import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService, UserServiceError } from '@services/user.service';
import { XsrfService } from '@services/xsrf.service';
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

  describe('onLogin', () => {
    beforeEach(() => {
      component.username = 'testuser';
      component.password = 'testpass';
    });

    it('should handle successful login', async () => {
      userService.login.mockResolvedValue();

      await component.onLogin();

      expect(userService.login).toHaveBeenCalledWith('testuser', 'testpass');
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
});
