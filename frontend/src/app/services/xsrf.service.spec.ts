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
  let mockCsrfService: { getApiV1CsrfToken: Mock };

  beforeEach(() => {
    mockCsrfService = {
      getApiV1CsrfToken: vi.fn().mockReturnValue(of({ token: 'test-token' })),
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
      mockCsrfService.getApiV1CsrfToken.mockReturnValue(
        of({ token: 'new-token' })
      );

      const token = await service.refreshToken();

      expect(mockCsrfService.getApiV1CsrfToken).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('should return empty string when API fails and no cookie exists', async () => {
      mockCsrfService.getApiV1CsrfToken.mockImplementation(() => {
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
  });
});
