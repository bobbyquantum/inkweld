import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UserAPIService } from '@worm/index';
import { Observable, of, throwError } from 'rxjs';

import { OAuthProviderListComponent } from './oauth-provider-list.component';

describe('OAuthProviderListComponent', () => {
  let component: OAuthProviderListComponent;
  let fixture: ComponentFixture<OAuthProviderListComponent>;
  let userService: jest.Mocked<UserAPIService>;
  let snackBar: jest.Mocked<MatSnackBar>;

  beforeEach(async () => {
    userService = {
      userControllerGetOAuthProviders: jest.fn(),
    } as unknown as jest.Mocked<UserAPIService>;

    snackBar = {
      open: jest.fn(),
    } as unknown as jest.Mocked<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [OAuthProviderListComponent, NoopAnimationsModule],
      providers: [
        { provide: UserAPIService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OAuthProviderListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should load OAuth2 providers on init', async () => {
      const getEnabledOAuth2ProvidersMock =
        userService.userControllerGetOAuthProviders as unknown as jest.MockedFunction<
          (observe: 'body') => Observable<string[]>
        >;
      getEnabledOAuth2ProvidersMock.mockReturnValue(of(['github', 'google']));

      // Initial state should be empty
      expect(component.enabledProviders()).toEqual([]);
      expect(component.isLoadingProviders()).toBeFalsy();
      expect(component.githubEnabled()).toBeFalsy();
      expect(component.googleEnabled()).toBeFalsy();

      // Start loading
      void component.ngOnInit();
      expect(component.isLoadingProviders()).toBeTruthy();

      // Wait for next tick to let async operations complete
      await Promise.resolve();

      // After loading completes
      expect(userService.userControllerGetOAuthProviders).toHaveBeenCalled();
      expect(component.enabledProviders()).toEqual(['github', 'google']);
      expect(component.isLoadingProviders()).toBeFalsy();
      expect(component.githubEnabled()).toBeTruthy();
      expect(component.googleEnabled()).toBeTruthy();
      expect(component.facebookEnabled()).toBeFalsy();
    });

    it('should handle OAuth2 providers loading error', async () => {
      const getEnabledOAuth2ProvidersMock =
        userService.userControllerGetOAuthProviders as unknown as jest.MockedFunction<
          (observe: 'body') => Observable<string[]>
        >;
      getEnabledOAuth2ProvidersMock.mockReturnValue(
        throwError(() => new Error('Failed to load providers'))
      );

      // Initial state should be empty
      expect(component.enabledProviders()).toEqual([]);
      expect(component.isLoadingProviders()).toBeFalsy();

      // Start loading
      void component.ngOnInit();
      expect(component.isLoadingProviders()).toBeTruthy();

      // Wait for next tick to let async operations complete
      await Promise.resolve();

      // After error
      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to load sign-in options',
        'Close',
        expect.any(Object)
      );
      expect(component.isLoadingProviders()).toBeFalsy();
      expect(component.enabledProviders()).toEqual([]);
      expect(component.githubEnabled()).toBeFalsy();
      expect(component.googleEnabled()).toBeFalsy();
    });
  });

  describe('OAuth sign-in', () => {
    let mockLocation: Location;
    let originalLocation: Location;

    beforeEach(() => {
      mockLocation = {
        href: '',
      } as Location;

      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    it('should redirect to OAuth provider', () => {
      component.signInWithProvider('github');
      expect(mockLocation.href).toBe(
        'http://localhost:8333/oauth2/authorization/github'
      );
    });

    it('should handle different OAuth providers', () => {
      const providers = ['github', 'google', 'facebook', 'discord', 'apple'];

      providers.forEach(provider => {
        component.signInWithProvider(provider);
        expect(mockLocation.href).toBe(
          `http://localhost:8333/oauth2/authorization/${provider}`
        );
      });
    });
  });
});
