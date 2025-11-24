import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthenticationService, OAuthProvidersResponse } from '@inkweld/index';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { OAuthProviderListComponent } from './oauth-provider-list.component';

describe('OAuthProviderListComponent', () => {
  let component: OAuthProviderListComponent;
  let fixture: ComponentFixture<OAuthProviderListComponent>;
  let authService: {
    listOAuthProviders: ReturnType<
      typeof vi.fn<() => Observable<OAuthProvidersResponse>>
    >;
  };
  let snackBar: Partial<MatSnackBar>;

  beforeEach(async () => {
    authService = {
      listOAuthProviders: vi.fn<() => Observable<OAuthProvidersResponse>>(),
    };

    snackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [OAuthProviderListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: AuthenticationService, useValue: authService },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OAuthProviderListComponent);
    component = fixture.componentInstance;
    // Don't call fixture.detectChanges() here - let individual tests control when ngOnInit runs
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('UI and text behavior', () => {
    beforeEach(() => {
      // Set up default mock behavior for UI tests
      authService.listOAuthProviders.mockReturnValue(
        of({ providers: { github: false } })
      );
      fixture.detectChanges();
    });

    it('should have isRegisterContext set to false by default', () => {
      expect(component.isRegisterContext).toBe(false);
    });

    it('should detect when any provider is enabled', () => {
      // Initially no providers enabled
      expect(component.hasAnyProviderEnabled()).toBe(false);

      // Enable one provider
      component.githubEnabled.set(true);
      expect(component.hasAnyProviderEnabled()).toBe(true);

      // Reset and try another provider
      component.githubEnabled.set(false);
      component.googleEnabled.set(true);
      expect(component.hasAnyProviderEnabled()).toBe(true);

      // Disable all providers
      component.googleEnabled.set(false);
      expect(component.hasAnyProviderEnabled()).toBe(false);
    });

    it('should determine when to show text based on loading state and enabled providers', () => {
      // When loading, text should not be shown
      component.isLoadingProviders.set(true);
      expect(component.shouldShowText()).toBe(false);

      // When loaded but no providers, text should not be shown
      component.isLoadingProviders.set(false);
      expect(component.shouldShowText()).toBe(false);

      // When loaded and at least one provider enabled, text should be shown
      component.githubEnabled.set(true);
      expect(component.shouldShowText()).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should load OAuth2 providers on init', async () => {
      authService.listOAuthProviders.mockReturnValue(
        of({ providers: { github: true, google: true } })
      );

      // Initial state should be empty
      expect(component.enabledProviders()).toEqual([]);
      expect(component.isLoadingProviders()).toBeFalsy();
      expect(component.githubEnabled()).toBeFalsy();
      expect(component.googleEnabled()).toBeFalsy();

      // Trigger ngOnInit via detectChanges
      fixture.detectChanges();

      // Wait for async operation
      await Promise.resolve();
      await Promise.resolve();

      // After loading completes
      expect(authService.listOAuthProviders).toHaveBeenCalled();
      expect(component.enabledProviders()).toEqual(['github', 'google']);
      expect(component.isLoadingProviders()).toBeFalsy();
      expect(component.githubEnabled()).toBeTruthy();
      expect(component.googleEnabled()).toBeTruthy();
      expect(component.facebookEnabled()).toBeFalsy();
    });

    it('should handle OAuth2 providers loading error', async () => {
      authService.listOAuthProviders.mockReturnValue(
        throwError(() => new Error('Failed to load providers'))
      );

      // Initial state should be empty
      expect(component.enabledProviders()).toEqual([]);
      expect(component.isLoadingProviders()).toBeFalsy();

      // Trigger ngOnInit via detectChanges
      fixture.detectChanges();

      // Wait for async operation
      await Promise.resolve();
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
