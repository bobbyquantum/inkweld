import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SetupService } from '../core/setup.service';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService', () => {
  let service: PasswordResetService;
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
        PasswordResetService,
      ],
    });
    service = TestBed.inject(PasswordResetService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('forgotPassword', () => {
    it('should POST to /api/v1/auth/forgot-password with email', async () => {
      const promise = service.forgotPassword('user@example.com');

      const req = httpController.expectOne('/api/v1/auth/forgot-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'user@example.com' });
      req.flush({
        message: 'If an account exists, a reset email has been sent.',
      });

      const result = await promise;
      expect(result).toEqual({
        message: 'If an account exists, a reset email has been sent.',
      });
    });
  });

  describe('resetPassword', () => {
    it('should POST to /api/v1/auth/reset-password with token and newPassword', async () => {
      const promise = service.resetPassword('token123', 'newpass456');

      const req = httpController.expectOne('/api/v1/auth/reset-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        token: 'token123',
        newPassword: 'newpass456',
      });
      req.flush({ message: 'Password has been reset successfully' });

      const result = await promise;
      expect(result).toEqual({
        message: 'Password has been reset successfully',
      });
    });

    it('should reject on error response', async () => {
      const promise = service.resetPassword('badtoken', 'newpass');

      const req = httpController.expectOne('/api/v1/auth/reset-password');
      req.flush(
        { error: 'Invalid or expired reset link' },
        { status: 400, statusText: 'Bad Request' }
      );

      await expect(promise).rejects.toThrow();
    });
  });
});
