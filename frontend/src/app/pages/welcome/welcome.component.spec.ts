import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { of, throwError } from 'rxjs';

import { WelcomeComponent } from './welcome.component';

jest.mock('@angular/common/http');
jest.mock('@angular/router');
jest.mock('@services/xsrf.service');

describe('WelcomeComponent', () => {
  let component: WelcomeComponent;
  let fixture: ComponentFixture<WelcomeComponent>;
  let httpClient: jest.Mocked<HttpClient>;
  let router: jest.Mocked<Router>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let xsrfService: jest.Mocked<XsrfService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;

  beforeEach(async () => {
    httpClient = {
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    router = {
      navigate: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    xsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('mock-xsrf-token'),
    } as unknown as jest.Mocked<XsrfService>;

    breakpointObserver = {
      observe: jest.fn().mockReturnValue(of({ matches: false })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    await TestBed.configureTestingModule({
      imports: [WelcomeComponent, NoopAnimationsModule],
      providers: [
        { provide: HttpClient, useValue: httpClient },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: XsrfService, useValue: xsrfService },
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

  it('should set isMobile based on breakpoint observer', () => {
    // Initial state from beforeEach setup
    expect(component.isMobile).toBeFalsy();

    // Create new component with mobile breakpoint
    breakpointObserver.observe.mockReturnValue(
      of({ matches: true } as unknown as BreakpointState)
    );
    fixture = TestBed.createComponent(WelcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.isMobile).toBeTruthy();
  });

  describe('login', () => {
    beforeEach(() => {
      component.username = 'testuser';
      component.password = 'password123';
    });

    it('should successfully login', () => {
      const mockResponse = { status: 200 };
      httpClient.post.mockReturnValue(of(mockResponse));

      component.onLogin();

      // First verify the call was made
      expect(httpClient.post).toHaveBeenCalled();
      const callArgs = httpClient.post.mock.calls[0];

      // Verify URL and body
      expect(callArgs[0]).toBe('/login');
      expect(callArgs[1]).toBe('username=testuser&password=password123');

      // Verify options
      const options = callArgs[2];
      expect(options).toEqual(
        expect.objectContaining({
          observe: 'response',
          withCredentials: true,
        })
      );

      // Create expected headers for comparison
      const expectedHeaders = new HttpHeaders({
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-XSRF-TOKEN': 'mock-xsrf-token',
      });

      // Get actual header values
      const headers = options!.headers as HttpHeaders;
      const contentType = headers.get('Content-Type');
      const xsrfToken = headers.get('X-XSRF-TOKEN');

      // Compare with expected values
      expect(contentType).toBe(expectedHeaders.get('Content-Type'));
      expect(xsrfToken).toBe(expectedHeaders.get('X-XSRF-TOKEN'));

      // Verify success handling
      expect(snackBar.open).toHaveBeenCalledWith(
        'Login successful',
        'Close',
        expect.any(Object)
      );
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should handle login error', () => {
      httpClient.post.mockReturnValue(
        throwError(() => new Error('Login failed'))
      );

      component.onLogin();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Login failed. Please check your credentials.',
        'Close',
        expect.any(Object)
      );
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
