import { HttpHandlerFn, HttpHeaders, HttpRequest } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthTokenService } from '../services/auth/auth-token.service';
import { authTokenInterceptor } from './auth-token.interceptor';

describe('authTokenInterceptor', () => {
  let authTokenService: {
    getToken: () => string | null;
  };
  let injector: Injector;

  beforeEach(() => {
    authTokenService = {
      getToken: vi.fn().mockReturnValue('test-jwt-token'),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: AuthTokenService, useValue: authTokenService }],
    });

    injector = TestBed.inject(Injector);
  });

  function callInterceptor(
    request: HttpRequest<any>,
    assertRequest?: (req: HttpRequest<any>) => void
  ): void {
    runInInjectionContext(injector, () => {
      const handler: HttpHandlerFn = (req: HttpRequest<any>) => {
        if (assertRequest) {
          assertRequest(req);
        }
        return of({} as any);
      };
      authTokenInterceptor(request, handler);
    });
  }

  it('should add Authorization header when token exists', () => {
    const mockRequest = new HttpRequest('GET', '/api/test');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.has('Authorization')).toBeTruthy();
    expect(capturedRequest?.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token'
    );
  });

  it('should skip token for auth/login endpoint', () => {
    const mockRequest = new HttpRequest('GET', '/api/auth/login');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should skip token for auth/register endpoint', () => {
    const mockRequest = new HttpRequest('GET', '/api/auth/register');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should skip token when no token is available', () => {
    (authTokenService.getToken as any).mockReturnValue(null);

    const mockRequest = new HttpRequest('GET', '/api/test');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should skip token when token is empty string', () => {
    (authTokenService.getToken as any).mockReturnValue('');

    const mockRequest = new HttpRequest('GET', '/api/test');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should add token to POST requests', () => {
    const mockRequest = new HttpRequest('POST', '/api/test', { data: 'test' });
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token'
    );
  });

  it('should add token to PUT requests', () => {
    const mockRequest = new HttpRequest('PUT', '/api/test/1', {
      data: 'test',
    });
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.method).toBe('PUT');
    expect(capturedRequest?.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token'
    );
  });

  it('should add token to DELETE requests', () => {
    const mockRequest = new HttpRequest('DELETE', '/api/test/1');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.method).toBe('DELETE');
    expect(capturedRequest?.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token'
    );
  });

  it('should preserve existing headers when adding Authorization', () => {
    const headers = new HttpHeaders().set('X-Custom-Header', 'custom-value');
    const mockRequest = new HttpRequest('GET', '/api/test', null, {
      headers,
    });
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.headers.get('Authorization')).toBe(
      'Bearer test-jwt-token'
    );
    expect(capturedRequest?.headers.get('X-Custom-Header')).toBe(
      'custom-value'
    );
  });

  it('should not add token for login endpoint even with valid token', () => {
    (authTokenService.getToken as any).mockReturnValue('valid-token');

    const mockRequest = new HttpRequest('POST', '/api/auth/login', {
      username: 'test',
    });
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should not add token for register endpoint even with valid token', () => {
    (authTokenService.getToken as any).mockReturnValue('valid-token');

    const mockRequest = new HttpRequest('POST', '/api/auth/register', {
      email: 'test@example.com',
    });
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });

  it('should handle token format correctly', () => {
    const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
    (authTokenService.getToken as any).mockReturnValue(testToken);

    const mockRequest = new HttpRequest('GET', '/api/test');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest?.headers.get('Authorization')).toBe(
      `Bearer ${testToken}`
    );
  });

  it('should pass through when token is not present and URL is not auth endpoint', () => {
    (authTokenService.getToken as any).mockReturnValue(null);

    const mockRequest = new HttpRequest('GET', '/api/data');
    let capturedRequest: HttpRequest<any> | undefined;

    callInterceptor(mockRequest, req => {
      capturedRequest = req;
    });

    expect(capturedRequest).toBe(mockRequest);
    expect(capturedRequest?.headers.has('Authorization')).toBeFalsy();
  });
});
