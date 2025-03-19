import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { CSRFService } from '@inkweld/index';
import { of } from 'rxjs';

import { XsrfService } from './xsrf.service';

describe('XsrfService', () => {
  let service: XsrfService;
  let mockCsrfService: { csrfControllerGetCsrfToken: jest.Mock };

  beforeEach(() => {
    mockCsrfService = {
      csrfControllerGetCsrfToken: jest
        .fn()
        .mockReturnValue(of({ token: 'test-token' })),
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { cookie: '' },
        },
        { provide: CSRFService, useValue: mockCsrfService },
        { provide: HttpClient, useValue: {} },
      ],
    });
    service = TestBed.inject(XsrfService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('refreshToken()', () => {
    it('should fetch token using CSRFService', async () => {
      mockCsrfService.csrfControllerGetCsrfToken.mockReturnValue(
        of({ token: 'new-token' })
      );

      const token = await service.refreshToken();

      expect(mockCsrfService.csrfControllerGetCsrfToken).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('should return empty string when API fails and no cookie exists', async () => {
      mockCsrfService.csrfControllerGetCsrfToken.mockImplementation(() => {
        throw new Error('API error');
      });

      const token = await service.refreshToken();
      expect(token).toBe('');
    });
  });

  describe('getToken()', () => {
    it('should refresh token when none exists', async () => {
      // Spy on refreshToken method
      jest.spyOn(service, 'refreshToken').mockResolvedValue('new-token');

      const token = await service.getToken();

      expect(service.refreshToken).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });
  });
});
