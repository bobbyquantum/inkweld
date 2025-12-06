import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SetupService } from '../core/setup.service';
import { AdminConfigService, ConfigValue } from './admin-config.service';

describe('AdminConfigService', () => {
  let service: AdminConfigService;
  let httpMock: HttpTestingController;
  const basePath = 'http://localhost:8333';

  const mockSetupService = {
    getServerUrl: () => basePath,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminConfigService,
        { provide: SetupService, useValue: mockSetupService },
      ],
    });

    service = TestBed.inject(AdminConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getConfig', () => {
    it('should fetch a config value', async () => {
      const mockConfig: ConfigValue = {
        key: 'USER_APPROVAL_REQUIRED',
        value: 'true',
        source: 'database',
      };

      const promise = service.getConfig('USER_APPROVAL_REQUIRED');

      const req = httpMock.expectOne(
        `${basePath}/api/v1/admin/config/USER_APPROVAL_REQUIRED`
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockConfig);

      const result = await promise;
      expect(result).toEqual(mockConfig);
    });

    it('should return null on error', async () => {
      const promise = service.getConfig('INVALID_KEY');

      const req = httpMock.expectOne(
        `${basePath}/api/v1/admin/config/INVALID_KEY`
      );
      req.flush('Not found', { status: 404, statusText: 'Not Found' });

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('setConfig', () => {
    it('should update a config value', async () => {
      const promise = service.setConfig('USER_APPROVAL_REQUIRED', 'false');

      const req = httpMock.expectOne(
        `${basePath}/api/v1/admin/config/USER_APPROVAL_REQUIRED`
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ value: 'false' });
      req.flush({});

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('deleteConfig', () => {
    it('should delete a config value', async () => {
      const promise = service.deleteConfig('USER_APPROVAL_REQUIRED');

      const req = httpMock.expectOne(
        `${basePath}/api/v1/admin/config/USER_APPROVAL_REQUIRED`
      );
      expect(req.request.method).toBe('DELETE');
      req.flush({});

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('getAllConfig', () => {
    it('should fetch all config values', async () => {
      const mockConfigs: Record<string, ConfigValue> = {
        USER_APPROVAL_REQUIRED: {
          key: 'USER_APPROVAL_REQUIRED',
          value: 'true',
          source: 'database',
        },
      };

      const promise = service.getAllConfig();

      const req = httpMock.expectOne(`${basePath}/api/v1/admin/config`);
      expect(req.request.method).toBe('GET');
      req.flush(mockConfigs);

      const result = await promise;
      expect(result).toEqual(mockConfigs);
    });
  });
});
