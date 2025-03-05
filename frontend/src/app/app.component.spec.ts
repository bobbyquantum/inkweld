import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { By } from '@angular/platform-browser';
import { Event, Router } from '@angular/router';
import { Configuration, UserAPIService } from '@inkweld/index';
import { UserService, UserServiceError } from '@services/user.service';
import { of, Subject } from 'rxjs';

import { userServiceMock } from '../testing/user-api.mock';
import { ThemeService } from '../themes/theme.service';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpTestingController: HttpTestingController;
  let routerEvents: Subject<Event>;
  let userService: jest.Mocked<UserService>;
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;

  beforeEach(async () => {
    routerEvents = new Subject<Event>();
    userService = {
      error: jest.fn().mockReturnValue(undefined),
      clearCurrentUser: jest.fn().mockResolvedValue(undefined),
      loadCurrentUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserService>;

    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        MatProgressSpinnerModule,
        MatToolbarModule,
        MatButtonModule,
      ],
      providers: [
        provideHttpClientTesting(),
        { provide: UserAPIService, useValue: userServiceMock },
        { provide: UserService, useValue: userService },
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
            navigate: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compileComponents();

    httpTestingController = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize theme on init', () => {
    const themeService = TestBed.inject(ThemeService);
    component.ngOnInit();
    expect(themeService.initTheme).toHaveBeenCalled();
  });

  it('should have the correct title', () => {
    expect(component.title).toBe('inkweld-frontend');
  });

  it('should have a router outlet', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('should bind theme class', () => {
    const themeService = TestBed.inject(ThemeService);

    (themeService.initTheme as jest.Mock).mockImplementation(() => {
      component.className = 'dark-theme';
    });

    component.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.classes['dark-theme']).toBeTruthy();
  });

  describe('Authentication Error Bar', () => {
    it('should not show error bar when no session expired error', () => {
      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should show error bar when session expired and not in offline mode', () => {
      userService.error.mockReturnValue(
        new UserServiceError('SESSION_EXPIRED', 'Session expired')
      );
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeTruthy();
    });

    it('should not show error bar when in offline mode', () => {
      userService.error.mockReturnValue(
        new UserServiceError('SESSION_EXPIRED', 'Session expired')
      );
      (
        component as AppComponent & { handleContinueOffline: () => void }
      ).handleContinueOffline();
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should handle re-authentication and navigate to welcome', async () => {
      const mockUser = {
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.png',
      };
      userServiceMock.userControllerGetMe.mockReturnValue(of(mockUser));
      const router = TestBed.inject(Router);
      const navigateSpy = jest.spyOn(router, 'navigate');

      const reAuthSpy = jest.spyOn(
        component as AppComponent & {
          handleReAuthenticate: () => Promise<void>;
        },
        'handleReAuthenticate'
      );
      await (
        component as AppComponent & {
          handleReAuthenticate: () => Promise<void>;
        }
      ).handleReAuthenticate();

      expect(reAuthSpy).toHaveBeenCalled();
      expect(userService.clearCurrentUser).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith(['/welcome']);
    });

    it('should handle continue offline', () => {
      const offlineSpy = jest.spyOn(
        component as AppComponent & { handleContinueOffline: () => void },
        'handleContinueOffline'
      );
      (
        component as AppComponent & { handleContinueOffline: () => void }
      ).handleContinueOffline();
      fixture.detectChanges();

      expect(offlineSpy).toHaveBeenCalled();
      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should show re-authenticate button when error bar is visible', () => {
      userService.error.mockReturnValue(
        new UserServiceError('SESSION_EXPIRED', 'Session expired')
      );
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button'));
      expect(button?.nativeElement.textContent.trim()).toBe('Re-authenticate');
    });

    it('should show continue offline button when error bar is visible', () => {
      userService.error.mockReturnValue(
        new UserServiceError('SESSION_EXPIRED', 'Session expired')
      );
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons[1]?.nativeElement.textContent.trim()).toBe(
        'Continue Offline'
      );
    });
  });
});
