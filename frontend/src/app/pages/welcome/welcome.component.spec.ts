import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpClient } from '@angular/common/http';
import {
  ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { XsrfService } from '@services/xsrf.service';
import { ThemeService } from '@themes/theme.service';
import { of, throwError } from 'rxjs';
import { UserAPIService } from 'worm-api-angular-client';

import { WelcomeComponent } from './welcome.component';

jest.mock('worm-api-angular-client');
jest.mock('@angular/material/snack-bar');
jest.mock('@services/xsrf.service');
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

describe('WelcomeComponent', () => {
  let component: WelcomeComponent;
  let fixture: ComponentFixture<WelcomeComponent>;
  let httpClient: jest.Mocked<HttpClient>;
  let userService: jest.Mocked<UserAPIService>;
  let router: jest.Mocked<Router>;
  let snackBar: jest.Mocked<MatSnackBar>;
  let xsrfService: jest.Mocked<XsrfService>;
  let breakpointObserver: jest.Mocked<BreakpointObserver>;

  beforeEach(async () => {
    httpClient = {
      post: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    userService = {
      getEnabledOAuth2Providers: jest
        .fn()
        .mockReturnValue(of(['github', 'google'])),
    } as unknown as jest.Mocked<UserAPIService>;

    router = {
      navigate: jest.fn(),
    } as unknown as jest.Mocked<Router>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    xsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('test-token'),
    } as unknown as jest.Mocked<XsrfService>;

    breakpointObserver = {
      observe: jest
        .fn()
        .mockReturnValue(of({ matches: false, breakpoints: {} })),
    } as unknown as jest.Mocked<BreakpointObserver>;

    await TestBed.configureTestingModule({
      imports: [WelcomeComponent, NoopAnimationsModule, MatIconModule],
      providers: [
        { provide: HttpClient, useValue: httpClient },
        { provide: UserAPIService, useValue: userService },
        { provide: Router, useValue: router },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: XsrfService, useValue: xsrfService },
        { provide: BreakpointObserver, useValue: breakpointObserver },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeComponent);
    component = fixture.componentInstance;

    // Inject and initialize ThemeService
    const themeService = TestBed.inject(ThemeService);
    themeService.initTheme(); // This registers the custom icons
  });

  it('should create', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(component).toBeTruthy();
    flush();
  }));

  it('should load OAuth providers on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(userService.getEnabledOAuth2Providers).toHaveBeenCalled();
    // expect(component.oauthProviders$).toBeDefined();
    flush();
  }));

  it('should handle OAuth provider error', fakeAsync(() => {
    userService.getEnabledOAuth2Providers.mockReturnValue(
      throwError(() => new Error('Test error'))
    );
    fixture.detectChanges();
    tick();
    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to load authentication providers.',
      'Close',
      expect.any(Object)
    );
    flush();
  }));
});
