import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed } from '@angular/core/testing';
import { Configuration } from '@worm/index';

import { ThemeService } from '../themes/theme.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpTestingController: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
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
});
