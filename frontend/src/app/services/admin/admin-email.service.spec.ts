import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SetupService } from '../core/setup.service';
import { AdminEmailService } from './admin-email.service';

describe('AdminEmailService', () => {
  let service: AdminEmailService;
  let httpController: HttpTestingController;

  const mockSetupService = {
    getServerUrl: () => '',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SetupService, useValue: mockSetupService },
        AdminEmailService,
      ],
    });
    service = TestBed.inject(AdminEmailService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('sendTestEmail', () => {
    it('should POST to /api/v1/admin/email/test', async () => {
      const promise = service.sendTestEmail();

      const req = httpController.expectOne('/api/v1/admin/email/test');
      expect(req.request.method).toBe('POST');
      req.flush({ success: true, message: 'Test email sent' });

      const result = await promise;
      expect(result).toEqual({
        success: true,
        message: 'Test email sent',
      });
    });

    it('should handle failure response', async () => {
      const mockResponse = {
        success: false,
        message: 'Failed to send: connection refused',
      };

      const promise = service.sendTestEmail();

      const req = httpController.expectOne('/api/v1/admin/email/test');
      req.flush(mockResponse);

      const result = await promise;
      expect(result).toEqual(mockResponse);
    });
  });
});
