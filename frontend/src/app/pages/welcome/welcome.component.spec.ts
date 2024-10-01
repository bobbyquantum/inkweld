import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WelcomeComponent } from './welcome.component';
import { HttpClient } from '@angular/common/http';
import { UserAPIService } from 'worm-api-client';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { XsrfService } from '@services/xsrf.service';
import { of } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('WelcomeComponent', () => {
  let component: WelcomeComponent;
  let fixture: ComponentFixture<WelcomeComponent>;
  let httpClientMock: jasmine.SpyObj<HttpClient>;
  let userServiceMock: jasmine.SpyObj<UserAPIService>;
  let routerMock: jasmine.SpyObj<Router>;
  let snackBarMock: jasmine.SpyObj<MatSnackBar>;
  let xsrfServiceMock: jasmine.SpyObj<XsrfService>;
  let breakpointObserverMock: jasmine.SpyObj<BreakpointObserver>;

  beforeEach(async () => {
    httpClientMock = jasmine.createSpyObj('HttpClient', ['post']);
    userServiceMock = jasmine.createSpyObj('UserAPIService', [
      'getEnabledOAuth2Providers',
    ]);
    routerMock = jasmine.createSpyObj('Router', ['navigate']);
    snackBarMock = jasmine.createSpyObj('MatSnackBar', ['open']);
    xsrfServiceMock = jasmine.createSpyObj('XsrfService', ['getXsrfToken']);
    breakpointObserverMock = jasmine.createSpyObj('BreakpointObserver', [
      'observe',
    ]);

    (userServiceMock.getEnabledOAuth2Providers as jasmine.Spy).and.returnValue(
      of(['github', 'google'])
    );
    breakpointObserverMock.observe.and.returnValue(
      of({ matches: false, breakpoints: {} })
    );

    await TestBed.configureTestingModule({
      imports: [WelcomeComponent, NoopAnimationsModule],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: UserAPIService, useValue: userServiceMock },
        { provide: Router, useValue: routerMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: XsrfService, useValue: xsrfServiceMock },
        { provide: BreakpointObserver, useValue: breakpointObserverMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
