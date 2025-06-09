import {
  HttpErrorResponse,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SetupService } from '../services/setup.service';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let interceptor: AuthInterceptor;
  let router: vi.Mocked<Router> & { url: string };
  let setupService: vi.Mocked<SetupService>;

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
        AuthInterceptor,
        { provide: Router, useValue: routerMock },
        { provide: SetupService, useValue: setupServiceMock },
      ],
    });

    interceptor = TestBed.inject(AuthInterceptor);
    router = TestBed.inject(Router) as vi.Mocked<Router> & { url: string };
    setupService = TestBed.inject(SetupService) as vi.Mocked<SetupService>;
  });

  it('should be created', () => {
    expect(interceptor).toBeTruthy();
  });

  it('should redirect to welcome on 401 error in server mode', () => {
    const request = new HttpRequest('GET', '/api/test');
    const error = new HttpErrorResponse({ status: 401 });

    const mockHandler = {
      handle: vi.fn().mockReturnValue(throwError(() => error)),
    };

    interceptor.intercept(request, mockHandler).subscribe({
      error: err => {
        expect(err).toBe(error);
        expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
      },
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

  it('should not redirect when already on welcome page', () => {
    router.url = '/welcome';
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
});
