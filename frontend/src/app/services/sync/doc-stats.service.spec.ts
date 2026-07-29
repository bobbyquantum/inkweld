import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { DocStatsService, type DocStorageStats } from './doc-stats.service';

describe('DocStatsService', () => {
  let service: DocStatsService;
  let httpMock: HttpTestingController;

  const mockStats: DocStorageStats = {
    documentId: 'user:slug:elements',
    hasSnapshot: true,
    incrementalRows: 3,
    totalRows: 4,
    loadedInMemory: true,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DocStatsService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(DocStatsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('fetchStats', () => {
    it('returns stats from the API', async () => {
      const promise = service.fetchStats('user:slug:elements');
      const req = httpMock.expectOne(
        r =>
          r.url.includes('/api/v1/ws/yjs/do/stats') &&
          r.params.get('documentId') === 'user:slug:elements'
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockStats);

      const result = await promise;
      expect(result).toEqual(mockStats);
    });

    it('returns null when apiUrl is empty', async () => {
      const original = environment.apiUrl;
      (environment as { apiUrl: string }).apiUrl = '';
      const result = await service.fetchStats('user:slug:elements');
      expect(result).toBeNull();
      httpMock.expectNone(() => true);
      (environment as { apiUrl: string }).apiUrl = original;
    });

    it('returns null on HTTP error (e.g. 404 on Bun dev server)', async () => {
      const promise = service.fetchStats('user:slug:elements');
      const req = httpMock.expectOne(() => true);
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });

      const result = await promise;
      expect(result).toBeNull();
    });

    it('caches results within TTL', async () => {
      const promise1 = service.fetchStats('user:slug:elements');
      httpMock.expectOne(() => true).flush(mockStats);
      await promise1;

      // Second call within TTL should use cache — no HTTP request
      const result = await service.fetchStats('user:slug:elements');
      expect(result).toEqual(mockStats);
      httpMock.expectNone(() => true);
    });

    it('refetches after TTL expires', async () => {
      vi.useFakeTimers();
      const promise1 = service.fetchStats('user:slug:elements');
      httpMock.expectOne(() => true).flush(mockStats);
      await promise1;

      // Advance past TTL
      vi.advanceTimersByTime(31_000);

      const promise2 = service.fetchStats('user:slug:elements');
      httpMock.expectOne(() => true).flush({ ...mockStats, totalRows: 99 });
      const result = await promise2;
      expect(result?.totalRows).toBe(99);
      vi.useRealTimers();
    });
  });

  describe('formatStats', () => {
    it('formats stats with all fields', () => {
      const text = service.formatStats(mockStats);
      expect(text).toContain('Rows: 4');
      expect(text).toContain('Compacted');
      expect(text).toContain('3 incremental');
      expect(text).toContain('In memory');
    });

    it('formats stats without snapshot', () => {
      const text = service.formatStats({
        ...mockStats,
        hasSnapshot: false,
        incrementalRows: 0,
        loadedInMemory: false,
      });
      expect(text).toContain('No snapshot');
      expect(text).not.toContain('incremental');
      expect(text).not.toContain('In memory');
    });

    it('returns unavailable message for null', () => {
      expect(service.formatStats(null)).toBe('Storage stats unavailable');
    });
  });
});
