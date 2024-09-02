import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { AppComponent } from './app.component';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { UserAPIService, Configuration } from 'worm-api-client';
import { ThemeService } from '../themes/theme.service';
import { of, throwError } from 'rxjs';

describe('AppComponent', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClientTesting(),
        {
          provide: UserAPIService,
          useValue: {
            getCurrentUser: jasmine
              .createSpy('getCurrentUser')
              .and.returnValue(of({})),
          },
        },
        {
          provide: Configuration,
          useValue: {},
        },
        {
          provide: ThemeService,
          useValue: {
            initTheme: jasmine.createSpy('initTheme'),
          },
        },
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should fetch current user on init', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    const mockUser = { id: 1, name: 'Test User' };
    const userService = TestBed.inject(UserAPIService);
    (userService.getCurrentUser as jasmine.Spy).and.returnValue(of(mockUser));

    component.ngOnInit();
    tick(); // This simulates the passage of time until all pending asynchronous activities complete

    expect(component.user).toEqual(mockUser);
    expect(userService.getCurrentUser).toHaveBeenCalled();
  }));

  it('should initialize theme on init', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const themeService = TestBed.inject(ThemeService);

    component.ngOnInit();

    expect(themeService.initTheme).toHaveBeenCalled();
  });

  it('should have the correct title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    expect(component.title).toBe('worm-frontend');
  });

  it('should handle error when fetching user fails', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const userService = TestBed.inject(UserAPIService);
    const consoleSpy = spyOn(console, 'log');
    const redirectSpy = spyOn(component, 'redirectToLogin');

    (userService.getCurrentUser as jasmine.Spy).and.returnValue(
      throwError(() => new Error('Test error'))
    );

    component.ngOnInit();
    tick();

    expect(consoleSpy).toHaveBeenCalledWith('Error', jasmine.any(Error));
    expect(redirectSpy).toHaveBeenCalled();
  }));

  it('should have a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('should bind theme class', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const themeService = TestBed.inject(ThemeService);

    (themeService.initTheme as jasmine.Spy).and.callFake(() => {
      component.className = 'dark-theme';
    });

    component.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.classes['dark-theme']).toBeTruthy();
  });
});
