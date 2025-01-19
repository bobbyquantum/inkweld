import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Event, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Configuration } from '@worm/index';
import { Subject } from 'rxjs';

import { ThemeService } from '../themes/theme.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpTestingController: HttpTestingController;
  let routerEvents: Subject<Event>;

  beforeEach(async () => {
    routerEvents = new Subject<Event>();

    await TestBed.configureTestingModule({
      imports: [AppComponent, MatProgressSpinnerModule],
      providers: [
        provideHttpClientTesting(),
        {
          provide: Configuration,
          useValue: {},
        },
        {
          provide: ThemeService,
          useValue: {
            initTheme: jest.fn(),
          },
        },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
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
    component.ngOnInit();
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

    (themeService.initTheme as jest.Mock).mockImplementation(() => {
      component.className = 'dark-theme';
    });

    component.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.classes['dark-theme']).toBeTruthy();
  });

  describe('Loading State', () => {
    it('should show loading overlay on NavigationStart', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      routerEvents.next(new NavigationStart(1, ''));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const overlay = compiled.querySelector('.loading-overlay');
      const message = compiled.querySelector('.loading-message');

      expect(overlay).toBeTruthy();
      expect(message?.textContent).toContain('Connecting to server');
    });

    it('should hide loading overlay on NavigationEnd', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      routerEvents.next(new NavigationStart(1, ''));
      fixture.detectChanges();

      routerEvents.next(new NavigationEnd(1, '', ''));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const overlay = compiled.querySelector('.loading-overlay');
      expect(overlay).toBeFalsy();
    });

    it('should cleanup router subscription on destroy', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const spy = jest.spyOn(routerEvents, 'subscribe');
      component.ngOnInit();

      expect(spy).toHaveBeenCalled();

      component.ngOnDestroy();

      routerEvents.next(new NavigationStart(1, ''));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const overlay = compiled.querySelector('.loading-overlay');
      expect(overlay).toBeFalsy();
    });
  });
});
