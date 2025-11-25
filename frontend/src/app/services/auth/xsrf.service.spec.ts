import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SecurityService } from '@inkweld/index';
import { of } from 'rxjs';
import { Mock, vi } from 'vitest';

import { XsrfService } from './xsrf.service';

describe('XsrfService', () => {
  let service: XsrfService;
  let mockCsrfService: { getCSRFToken: Mock };

  beforeEach(() => {
    mockCsrfService = {
      getCSRFToken: vi.fn().mockReturnValue(of({ token: 'test-token' })),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: DOCUMENT,
          useValue: { cookie: '' },
        },
        { provide: SecurityService, useValue: mockCsrfService },
        { provide: HttpClient, useValue: {} },
      ],
    });
    service = TestBed.inject(XsrfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('refreshToken()', () => {
    it('should fetch token using SecurityService', async () => {
      mockCsrfService.getCSRFToken.mockReturnValue(of({ token: 'new-token' }));

      const token = await service.refreshToken();

      expect(mockCsrfService.getCSRFToken).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('should return empty string when API fails and no cookie exists', async () => {
      mockCsrfService.getCSRFToken.mockImplementation(() => {
        throw new Error('API error');
      });

      const token = await service.refreshToken();
      expect(token).toBe('');
    });
  });

  describe('getToken()', () => {
    it('should refresh token when none exists', async () => {
      // Spy on refreshToken method
      vi.spyOn(service, 'refreshToken').mockResolvedValue('new-token');

      const token = await service.getToken();

      expect(service.refreshToken).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('should return cached token if not expired', async () => {
      // Set up a token via refreshToken first
      mockCsrfService.getCSRFToken.mockReturnValue(
        of({ token: 'cached-token' })
      );
      await service.refreshToken();

      // Spy on refreshToken to ensure it's not called again
      const refreshSpy = vi.spyOn(service, 'refreshToken');

      const token = await service.getToken();

      expect(refreshSpy).not.toHaveBeenCalled();
      expect(token).toBe('cached-token');
    });

    it('should refresh token if expired', async () => {
      // Set up an expired token by manipulating time
      mockCsrfService.getCSRFToken.mockReturnValue(of({ token: 'old-token' }));
      await service.refreshToken();

      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 6 * 60 * 1000); // 6 minutes later

      mockCsrfService.getCSRFToken.mockReturnValue(of({ token: 'new-token' }));

      const token = await service.getToken();

      expect(token).toBe('new-token');

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('getXsrfToken()', () => {
    it('should return token from cookie if available', () => {
      const mockDocument = TestBed.inject(DOCUMENT) as { cookie: string };
      mockDocument.cookie = 'XSRF-TOKEN=cookie-token';

      const token = service.getXsrfToken();

      expect(token).toBe('cookie-token');
    });

    it('should return stored token if no cookie', async () => {
      const mockDocument = TestBed.inject(DOCUMENT) as { cookie: string };
      mockDocument.cookie = '';

      // Set stored token via refreshToken
      mockCsrfService.getCSRFToken.mockReturnValue(
        of({ token: 'stored-token' })
      );
      await service.refreshToken();

      const token = service.getXsrfToken();

      expect(token).toBe('stored-token');
    });

    it('should update stored token if cookie token differs', async () => {
      // First set a stored token
      mockCsrfService.getCSRFToken.mockReturnValue(
        of({ token: 'old-stored-token' })
      );
      await service.refreshToken();

      // Then set a different cookie token
      const mockDocument = TestBed.inject(DOCUMENT) as { cookie: string };
      mockDocument.cookie = 'XSRF-TOKEN=new-cookie-token';

      const token = service.getXsrfToken();

      expect(token).toBe('new-cookie-token');
      // Calling again should return the same (now updated) token
      expect(service.getXsrfToken()).toBe('new-cookie-token');
    });

    it('should handle malformed cookie', () => {
      const mockDocument = TestBed.inject(DOCUMENT) as { cookie: string };
      mockDocument.cookie = 'OTHER-COOKIE=value';

      const token = service.getXsrfToken();

      expect(token).toBe('');
    });
  });

  describe('cookie initialization', () => {
    it('should initialize token from cookie on construction', () => {
      // Create a new service instance with cookie already set
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          {
            provide: DOCUMENT,
            useValue: { cookie: 'XSRF-TOKEN=init-token' },
          },
          { provide: SecurityService, useValue: mockCsrfService },
          { provide: HttpClient, useValue: {} },
        ],
      });

      const newService = TestBed.inject(XsrfService);

      expect(newService.getXsrfToken()).toBe('init-token');
    });
  });

  describe('error handling', () => {
    it('should handle invalid token format from server', async () => {
      mockCsrfService.getCSRFToken.mockReturnValue(of({ token: null }));

      const token = await service.refreshToken();

      expect(token).toBe('');
    });

    it('should handle missing token in response', async () => {
      mockCsrfService.getCSRFToken.mockReturnValue(of({}));

      const token = await service.refreshToken();

      expect(token).toBe('');
    });

    it('should use cookie fallback when API throws error', async () => {
      mockCsrfService.getCSRFToken.mockImplementation(() => {
        throw new Error('Network error');
      });

      const mockDocument = TestBed.inject(DOCUMENT) as { cookie: string };
      mockDocument.cookie = 'XSRF-TOKEN=fallback-token';

      const token = await service.refreshToken();

      expect(token).toBe('fallback-token');
    });
  });
});
