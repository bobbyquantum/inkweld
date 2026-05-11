import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  ProjectStatsResponse,
  UserStatsResponse,
} from '@models/writing-stats';
import { SetupService } from '@services/core/setup.service';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WritingStatsService } from './writing-stats.service';

describe('WritingStatsService', () => {
  let service: WritingStatsService;
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
        WritingStatsService,
      ],
    });
    service = TestBed.inject(WritingStatsService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProjectStats', () => {
    const mockResponse: ProjectStatsResponse = {
      projectId: 'p-1',
      windowDays: 30,
      totalWords: 123,
      daily: [{ day: '2025-01-01', words: 50 }],
      contributors: [{ userId: 'u-1', username: 'alice', words: 100 }],
    };

    it('GETs the project stats endpoint with default days=30', async () => {
      const promise = firstValueFrom(
        service.getProjectStats('alice', 'my-book')
      );

      const req = httpController.expectOne(
        r => r.url === '/api/v1/stats/projects/alice/my-book'
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('days')).toBe('30');
      expect(req.request.withCredentials).toBe(true);
      req.flush(mockResponse);

      const result = await promise;
      expect(result).toEqual(mockResponse);
    });

    it('passes a custom days param', async () => {
      const promise = firstValueFrom(
        service.getProjectStats('alice', 'my-book', 7)
      );

      const req = httpController.expectOne(
        r => r.url === '/api/v1/stats/projects/alice/my-book'
      );
      expect(req.request.params.get('days')).toBe('7');
      req.flush(mockResponse);
      await promise;
    });

    it('URL-encodes the username and slug', async () => {
      const promise = firstValueFrom(
        service.getProjectStats('with space', 'slug/with-slash')
      );
      const req = httpController.expectOne(
        r => r.url === '/api/v1/stats/projects/with%20space/slug%2Fwith-slash'
      );
      req.flush(mockResponse);
      await promise;
    });

    it('uses the setup service base path when provided', async () => {
      // Re-create with non-empty base url
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: SetupService,
            useValue: { getServerUrl: () => 'https://api.example.com' },
          },
          WritingStatsService,
        ],
      });
      const customService = TestBed.inject(WritingStatsService);
      const customController = TestBed.inject(HttpTestingController);

      const promise = firstValueFrom(
        customService.getProjectStats('alice', 'my-book')
      );
      const req = customController.expectOne(
        r =>
          r.url ===
          'https://api.example.com/api/v1/stats/projects/alice/my-book'
      );
      req.flush(mockResponse);
      await promise;
      customController.verify();
    });
  });

  describe('getMyStats', () => {
    const mockResponse: UserStatsResponse = {
      windowDays: 30,
      projectCount: 2,
      totalWords: 500,
      daily: [],
    };

    it('GETs /api/v1/stats/me with default days=30', async () => {
      const promise = firstValueFrom(service.getMyStats());

      const req = httpController.expectOne(r => r.url === '/api/v1/stats/me');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('days')).toBe('30');
      expect(req.request.withCredentials).toBe(true);
      req.flush(mockResponse);

      const result = await promise;
      expect(result).toEqual(mockResponse);
    });

    it('passes a custom days param', async () => {
      const promise = firstValueFrom(service.getMyStats(90));
      const req = httpController.expectOne(r => r.url === '/api/v1/stats/me');
      expect(req.request.params.get('days')).toBe('90');
      req.flush(mockResponse);
      await promise;
    });
  });
});
