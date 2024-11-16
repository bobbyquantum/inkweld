import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  flush,
} from '@angular/core/testing';
import { WelcomeComponent } from './welcome.component';
import { HttpClient } from '@angular/common/http';
import { UserAPIService } from 'worm-api-client';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XsrfService } from '@services/xsrf.service';
import { of, throwError } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

jest.mock('worm-api-client');
jest.mock('@angular/material/snack-bar');
jest.mock('@services/xsrf.service');

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
      imports: [WelcomeComponent, NoopAnimationsModule],
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
