import { DOCUMENT } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { XsrfService } from '../services/xsrf.service';
import { CsrfInterceptor } from './csrf.interceptor';

// Mock environment
jest.mock('../../environments/environment', () => ({
  environment: {
    apiUrl: 'http://test-api.example.com',
  },
}));

describe('CsrfInterceptor', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;
  let mockXsrfService: { getXsrfToken: jest.Mock; refreshToken: jest.Mock };
  const apiUrl = 'http://test-api.example.com';
  let mockDocument: { cookie: string };

  beforeEach(() => {
    // Create mocks
    mockDocument = { cookie: '' };
    mockXsrfService = {
      getXsrfToken: jest.fn().mockReturnValue('test-token'),
      refreshToken: jest.fn().mockResolvedValue('new-token'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
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
    httpTestingController.verify();
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
});
