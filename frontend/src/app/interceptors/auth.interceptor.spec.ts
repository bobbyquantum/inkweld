import {
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { SetupService } from '../services/core/setup.service';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let interceptor: AuthInterceptor;
  let router: MockedObject<Router> & { url: string };
  let setupService: MockedObject<SetupService>;

  beforeEach(() => {
    const routerMock = {
      url: '/',
      navigate: vi.fn().mockResolvedValue(true),
    };

    const setupServiceMock = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        AuthInterceptor,
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
      ],
    });

    interceptor = TestBed.inject(AuthInterceptor);
    router = TestBed.inject(Router) as MockedObject<Router> & { url: string };
    setupService = TestBed.inject(SetupService) as MockedObject<SetupService>;
  });

  it('should be created', () => {
    expect(interceptor).toBeTruthy();
  });

  it('should redirect to welcome on 401 error in server mode', async () => {
    // Set router URL to something other than '/', '/welcome', or '/register'
    router.url = '/projects';

    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    return new Promise<void>((resolve, reject) => {
      interceptor.intercept(request, mockHandler).subscribe({
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        error: async err => {
          try {
            expect(err).toBe(error);
            // Wait for the navigate promise to resolve
            await Promise.resolve();
            expect(router.navigate).toHaveBeenCalledWith(['/']);
            resolve();
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        },
      });
    });
  });

  it('should not redirect on 401 error in offline mode', () => {
    setupService.getMode.mockReturnValue('offline');
    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).not.toHaveBeenCalled();
      },
    });
  });

  it('should not redirect when already on home page', () => {
    router.url = '/';
    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).not.toHaveBeenCalled();
      },
    });
  });

  it('should not redirect on non-401 errors', () => {
    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 500 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).not.toHaveBeenCalled();
      },
    });
  });

  it('should not redirect on 401 for login endpoint', () => {
    router.url = '/';
    const request = new HttpRequest('POST', '/api/v1/auth/login', {});
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).not.toHaveBeenCalled();
      },
    });
  });

  it('should not redirect on 401 for register endpoint', () => {
    router.url = '/';
    const request = new HttpRequest('POST', '/api/v1/auth/register', {});
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).not.toHaveBeenCalled();
      },
    });
  });

  it('should pass through successful requests', () => {
    const request = new HttpRequest('GET', '/api/test');
    const response = new HttpResponse({ status: 200 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(of(response)),
    };

    interceptor.intercept(request, mockHandler).subscribe(result => {
      expect(result).toBe(response);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  it('should add Authorization header when token exists', () => {
    localStorage.setItem('auth_token', 'test-token');
    const request = new HttpRequest('GET', '/api/test');
    const response = new HttpResponse({ status: 200 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(of(response)),
    };

    interceptor.intercept(request, mockHandler).subscribe(() => {
      const clonedRequest = mockHandler.handle.mock
        .calls[0][0] as HttpRequest<unknown>;
      expect(clonedRequest.headers.get('Authorization')).toBe(
        'Bearer test-token'
      );
    });

    localStorage.removeItem('auth_token');
  });

  it('should handle navigation failure gracefully', async () => {
    router.url = '/projects';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    router.navigate.mockRejectedValue(new Error('Navigation failed'));

    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    return new Promise<void>((resolve, reject) => {
      interceptor.intercept(request, mockHandler).subscribe({
        error: () => {
          void (async () => {
            try {
              await Promise.resolve();
              await Promise.resolve();
              expect(consoleSpy).toHaveBeenCalledWith(
                'Failed to navigate to home page:',
                expect.any(Error)
              );
              consoleSpy.mockRestore();
              resolve();
            } catch (e) {
              consoleSpy.mockRestore();
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          })();
        },
      });
    });
  });
});
