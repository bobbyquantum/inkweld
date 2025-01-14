import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { of } from 'rxjs';

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
      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });
    });

    it('should redirect to login endpoint', () => {
      component.onLogin();
      expect(window.location.href).toBe('http://localhost:8333/login');
    });
  });
});
