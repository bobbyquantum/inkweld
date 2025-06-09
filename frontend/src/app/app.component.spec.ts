import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { By } from '@angular/platform-browser';
import { Event, Router } from '@angular/router';
import { Configuration, UserAPIService } from '@inkweld/index';
import { SetupService } from '@services/setup.service';
import { UnifiedUserService } from '@services/unified-user.service';
import { Subject } from 'rxjs';

import { userServiceMock } from '../testing/user-api.mock';
import { ThemeService } from '../themes/theme.service';
import { AppComponent } from './app.component';

class TestError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'TestError';
  }
}

describe('AppComponent', () => {
  let httpTestingController: HttpTestingController;
  let routerEvents: Subject<Event>;
  let unifiedUserService: vi.Mocked<UnifiedUserService>;
  let setupService: vi.Mocked<SetupService>;
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let errorSignal: any;
  let initializedSignal: any;
  let currentUserSignal: any;

  beforeEach(async () => {
    routerEvents = new Subject<Event>();

    errorSignal = signal(null);
    initializedSignal = signal(true);
    currentUserSignal = signal({ name: 'anonymous', username: 'anonymous' });

    unifiedUserService = {
      error: errorSignal,
      initialized: initializedSignal,
      currentUser: currentUserSignal,
      logout: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
    } as unknown as vi.Mocked<UnifiedUserService>;

    setupService = {
      checkConfiguration: vi.fn().mockReturnValue(true),
      getMode: vi.fn().mockReturnValue('server'),
    } as unknown as vi.Mocked<SetupService>;

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
        { provide: UnifiedUserService, useValue: unifiedUserService },
        { provide: SetupService, useValue: setupService },
        {
          provide: Configuration,
          useValue: {},
        },
        {
          provide: ThemeService,
          useValue: {
            initTheme: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            navigate: vi.fn().mockResolvedValue(true),
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

  it('should have a router outlet', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  describe('Authentication Error Bar', () => {
    it('should not show error bar when no session expired error', () => {
      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should show error bar when session expired and not in offline mode', () => {
      // First set a real user to simulate previous authentication
      currentUserSignal.set({ name: 'John Doe', username: 'john' });
      fixture.detectChanges();

      // Then simulate session expiration
      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeTruthy();
    });

    it('should not show error bar when session expired but user was never initialized', () => {
      // Set initialized to false to simulate a user who was never authenticated
      initializedSignal.set(false);
      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should show error bar when user had real session then got session expired', () => {
      // First set a real user to simulate previous authentication
      currentUserSignal.set({ name: 'John Doe', username: 'john' });
      fixture.detectChanges();

      // Then simulate session expiration with anonymous user
      currentUserSignal.set({ name: 'anonymous', username: 'anonymous' });
      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeTruthy();
    });

    it('should not show error bar when in offline mode', () => {
      // First set a real user to simulate previous authentication
      currentUserSignal.set({ name: 'John Doe', username: 'john' });
      fixture.detectChanges();

      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      (
        component as AppComponent & { handleContinueOffline: () => void }
      ).handleContinueOffline();
      fixture.detectChanges();

      const toolbar = fixture.debugElement.query(By.css('.auth-error-bar'));
      expect(toolbar).toBeFalsy();
    });

    it('should handle re-authentication and navigate to welcome', async () => {
      const reAuthSpy = vi.spyOn(
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
      expect(unifiedUserService.logout).toHaveBeenCalled();
      expect((component as any).offlineMode()).toBe(false);
    });

    it('should handle continue offline', () => {
      const offlineSpy = vi.spyOn(
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
      // First set a real user to simulate previous authentication
      currentUserSignal.set({ name: 'John Doe', username: 'john' });
      fixture.detectChanges();

      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button'));
      expect(button?.nativeElement.textContent.trim()).toBe('Re-authenticate');
    });

    it('should show continue offline button when error bar is visible', () => {
      // First set a real user to simulate previous authentication
      currentUserSignal.set({ name: 'John Doe', username: 'john' });
      fixture.detectChanges();

      errorSignal.set(new TestError('SESSION_EXPIRED', 'Session expired'));
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons[1]?.nativeElement.textContent.trim()).toBe(
        'Continue Offline'
      );
    });
  });
});
