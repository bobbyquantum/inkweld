import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';

import { OAuthCallbackComponent } from './oauth-callback.component';

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('OAuthCallbackComponent', () => {
  let component: OAuthCallbackComponent;
  let fixture: ComponentFixture<OAuthCallbackComponent>;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let mockHttp: { post: ReturnType<typeof vi.fn> };
  let mockAuthTokenService: {
    setToken: ReturnType<typeof vi.fn>;
    clearToken: ReturnType<typeof vi.fn>;
  };
  let mockSetupService: { getServerUrl: ReturnType<typeof vi.fn> };
  let mockUserService: { loadCurrentUser: ReturnType<typeof vi.fn> };
  let queryParams: Map<string, string>;

  function createComponent(): void {
    fixture = TestBed.createComponent(OAuthCallbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    queryParams = new Map<string, string>();

    mockRouter = { navigate: vi.fn().mockResolvedValue(true) };
    mockHttp = {
      post: vi.fn().mockReturnValue(of({ token: 'jwt-token-123' })),
    };
    mockAuthTokenService = {
      setToken: vi.fn(),
      clearToken: vi.fn(),
    };
    mockSetupService = {
      getServerUrl: vi.fn().mockReturnValue('http://localhost:8333'),
    };
    mockUserService = {
      loadCurrentUser: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [OAuthCallbackComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Router, useValue: mockRouter },
        { provide: HttpClient, useValue: mockHttp },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: UserService, useValue: mockUserService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => queryParams.get(key) ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  describe('successful code exchange', () => {
    it('should exchange code for token and navigate home', async () => {
      queryParams.set('code', 'one-time-code-123');
      createComponent();
      await flushPromises();

      expect(mockHttp.post).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/auth/exchange-code',
        { code: 'one-time-code-123' }
      );
      expect(mockAuthTokenService.setToken).toHaveBeenCalledWith(
        'jwt-token-123'
      );
      expect(mockUserService.loadCurrentUser).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        replaceUrl: true,
      });
    });

    it('should use window.location.origin when no server URL configured', async () => {
      mockSetupService.getServerUrl.mockReturnValue('');
      queryParams.set('code', 'code-123');
      createComponent();
      await flushPromises();

      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/exchange-code'),
        { code: 'code-123' }
      );
    });
  });

  describe('error handling', () => {
    it('should show error message for github_auth_failed', () => {
      queryParams.set('error', 'github_auth_failed');
      createComponent();

      expect(component.errorMessage).toBe(
        'GitHub authentication failed. Please try again.'
      );
    });

    it('should show error message for account_disabled', () => {
      queryParams.set('error', 'account_disabled');
      createComponent();

      expect(component.errorMessage).toBe(
        'Your account has been disabled. Contact an administrator.'
      );
    });

    it('should show generic error for unknown error codes', () => {
      queryParams.set('error', 'some_unknown_error');
      createComponent();

      expect(component.errorMessage).toBe(
        'An unexpected error occurred during sign-in.'
      );
    });

    it('should show error when no code or error param present', () => {
      createComponent();

      expect(component.errorMessage).toBe('No authorization code received.');
    });

    it('should clear token and show error when code exchange fails', async () => {
      mockHttp.post.mockReturnValue(
        throwError(() => new Error('Network error'))
      );
      queryParams.set('code', 'bad-code');
      createComponent();
      await flushPromises();

      expect(mockAuthTokenService.clearToken).toHaveBeenCalled();
      expect(component.errorMessage).toBe(
        'Failed to complete sign-in. Please try again.'
      );
    });

    it('should clear token when user loading fails', async () => {
      mockUserService.loadCurrentUser.mockRejectedValue(
        new Error('User load failed')
      );
      queryParams.set('code', 'valid-code');
      createComponent();
      await flushPromises();

      expect(mockAuthTokenService.clearToken).toHaveBeenCalled();
      expect(component.errorMessage).toBe(
        'Failed to complete sign-in. Please try again.'
      );
    });
  });

  describe('UI rendering', () => {
    it('should show spinner while processing', () => {
      queryParams.set('code', 'code-123');
      // Don't resolve the HTTP call to keep component in loading state
      mockHttp.post.mockReturnValue(new Subject());
      createComponent();

      expect(component.errorMessage).toBe('');
      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });

    it('should show error UI when an error message is set', () => {
      queryParams.set('error', 'github_auth_failed');
      createComponent();
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.error');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.querySelector('h2')?.textContent?.trim()).toBe(
        'Sign-in failed'
      );
    });

    it('should show return link in error state', () => {
      queryParams.set('error', 'github_auth_failed');
      createComponent();
      fixture.detectChanges();

      const link = fixture.nativeElement.querySelector('.error a');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('href')).toBe('/');
    });
  });
});
