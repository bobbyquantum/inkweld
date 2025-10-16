import { DOCUMENT } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { XsrfService } from '../services/xsrf.service';
import { CsrfInterceptor } from './csrf.interceptor';

describe('CsrfInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let mockXsrfService: {
    getXsrfToken: Mock;
    refreshToken: Mock;
  };
  // Use the actual environment apiUrl to match what the interceptor checks
  let apiUrl: string;
  let mockDocument: { cookie: string };

  beforeEach(async () => {
    // Import environment dynamically to avoid instantiating TestBed too early
    const { environment } = await import('../../environments/environment');
    apiUrl = environment.apiUrl;
    // Create mocks
    mockDocument = { cookie: '' };
    mockXsrfService = {
      getXsrfToken: vi.fn().mockReturnValue('test-token'),
      refreshToken: vi.fn().mockResolvedValue('new-token'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: CsrfInterceptor,
          multi: true,
        },
        { provide: XsrfService, useValue: mockXsrfService },
        { provide: DOCUMENT, useValue: mockDocument },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController?.verify();
    TestBed.resetTestingModule();
  });

  it('should not add token for GET requests', () => {
    httpClient.get(`${apiUrl}/data`).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeFalsy();
    req.flush({});
  });

  it('should not add token for non-API requests', () => {
    httpClient.post('https://example.com/data', {}).subscribe();

    const req = httpTestingController.expectOne('https://example.com/data');
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeFalsy();
    req.flush({});
  });

  it('should not add token for csrf/token endpoint', () => {
    httpClient.get(`${apiUrl}/csrf/token`).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/csrf/token`);
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeFalsy();
    req.flush({});
  });

  it('should add token for POST requests to API endpoints', () => {
    httpClient.post(`${apiUrl}/data`, {}).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeTruthy();
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
    req.flush({});
  });

  it('should add token for PUT requests to API endpoints', () => {
    httpClient.put(`${apiUrl}/data/1`, {}).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data/1`);
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeTruthy();
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
    req.flush({});
  });

  it('should add token for DELETE requests to API endpoints', () => {
    httpClient.delete(`${apiUrl}/data/1`).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data/1`);
    expect(req.request.headers.has('X-CSRF-TOKEN')).toBeTruthy();
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
    req.flush({});
  });

  it('should get token from cookie if available', () => {
    // Set a cookie with XSRF token
    mockDocument.cookie = 'XSRF-TOKEN=cookie-token; path=/';

    httpClient.post(`${apiUrl}/data`, {}).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('cookie-token');
    req.flush({});
  });

  it('should fallback to stored token when cookie is not present', () => {
    // Ensure cookie is empty
    mockDocument.cookie = '';

    httpClient.post(`${apiUrl}/data`, {}).subscribe();

    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('test-token');
    req.flush({});
  });

  it('should fetch new token when none is available', async () => {
    // Make sure both cookie and stored token are empty
    mockDocument.cookie = '';
    mockXsrfService.getXsrfToken.mockReturnValue('');

    // Use a synchronous resolved Promise instead of an actual async Promise
    mockXsrfService.refreshToken.mockReturnValue(Promise.resolve('new-token'));

    // Start request but don't wait for it yet
    const requestPromise = firstValueFrom(
      httpClient.post(`${apiUrl}/data`, {})
    );

    // We need to let the async tasks complete first - add more ticks
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Allow microtasks to process
    await new Promise(resolve => setTimeout(resolve, 0));

    // Now we can check if the request was made with the correct token
    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(mockXsrfService.refreshToken).toHaveBeenCalled();
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('new-token');

    // Complete the request
    req.flush({ success: true });

    // Wait for request to complete
    const result = await requestPromise;
    expect(result).toEqual({ success: true });
  });

  it('should not retry non-CSRF 403 errors', () => {
    const errorResponse = {
      status: 403,
      statusText: 'Forbidden',
      error: { message: 'Authorization failed' },
    };

    // Set up an observable with error handler
    let errorCaught = false;
    httpClient.post(`${apiUrl}/data`, {}).subscribe({
      next: () => {
        throw new Error('Should not succeed');
      },
      error: error => {
        errorCaught = true;
        expect(error.status).toBe(403);
      },
    });

    // Handle the request with error
    const req = httpTestingController.expectOne(`${apiUrl}/data`);
    req.flush(errorResponse.error, errorResponse);

    // Verify no retry happened
    httpTestingController.verify();
    expect(errorCaught).toBe(true);
  });

  it('should prevent concurrent token refreshes', async () => {
    // Reset mocks to a clean state
    mockXsrfService.refreshToken.mockReset();

    // Ensure no token is available so requests will need to refresh
    mockXsrfService.getXsrfToken.mockReturnValue('');

    // Create a shared, resolvable promise for the token refresh
    let resolveTokenPromise: (value: string) => void;
    const tokenPromise = new Promise<string>(resolve => {
      resolveTokenPromise = resolve;
    });

    // Set up the refreshToken mock to return our controlled promise
    mockXsrfService.refreshToken.mockReturnValue(tokenPromise);

    // Start two concurrent requests that will both need a token
    const request1 = httpClient.post(`${apiUrl}/data1`, {}).toPromise();
    const request2 = httpClient.post(`${apiUrl}/data2`, {}).toPromise();

    // Wait for requests to be processed by the interceptor
    await Promise.resolve();
    await Promise.resolve();

    // Both requests should be pending, waiting for the token
    // Resolve the token promise
    resolveTokenPromise!('shared-token');

    // Allow the token promise to resolve
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Now handle both HTTP requests
    const req1 = httpTestingController.expectOne(`${apiUrl}/data1`);
    const req2 = httpTestingController.expectOne(`${apiUrl}/data2`);

    // Both should have the same token
    expect(req1.request.headers.get('X-CSRF-TOKEN')).toBe('shared-token');
    expect(req2.request.headers.get('X-CSRF-TOKEN')).toBe('shared-token');

    // Complete both requests
    req1.flush({ result: 'success1' });
    req2.flush({ result: 'success2' });

    // We need to clean up pending promises
    await Promise.all([request1, request2]);

    // Verify refreshToken was only called once
    expect(mockXsrfService.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('should parse cookie correctly', () => {
    // Test with a simple cookie
    mockDocument.cookie = 'XSRF-TOKEN=simple-token';
    httpClient.post(`${apiUrl}/data`, {}).subscribe();

    let req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('simple-token');
    req.flush({});

    // Test with multiple cookies
    mockDocument.cookie =
      'other=value; XSRF-TOKEN=multi-cookie-token; another=cookie';
    httpClient.post(`${apiUrl}/data`, {}).subscribe();

    req = httpTestingController.expectOne(`${apiUrl}/data`);
    expect(req.request.headers.get('X-CSRF-TOKEN')).toBe('multi-cookie-token');
    req.flush({});
  });
});
