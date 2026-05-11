import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ProjectActivityResponse,
  UserActivityResponse,
} from '../../models/activity-event';
import { SetupService } from '../core/setup.service';
import { ActivityFeedService } from './activity-feed.service';

describe('ActivityFeedService', () => {
  let service: ActivityFeedService;
  let httpController: HttpTestingController;

  const mockSetupService = { getServerUrl: () => '' };

  const projectResponse: ProjectActivityResponse = {
    events: [
      {
        id: 'e-1',
        projectId: 'p-1',
        userId: 'u-1',
        username: 'alice',
        eventType: 'document_edit',
        entityId: 'el-1',
        entityName: 'Chapter 1',
        metadata: null,
        createdAt: 1_700_000_000_000,
      },
    ],
    nextBefore: null,
  };

  const userResponse: UserActivityResponse = {
    events: [
      {
        id: 'e-1',
        projectId: 'p-1',
        projectSlug: 'my-book',
        projectTitle: 'My Book',
        projectOwnerUsername: 'alice',
        userId: 'u-1',
        username: 'alice',
        eventType: 'snapshot_created',
        entityId: null,
        entityName: null,
        metadata: null,
        createdAt: 1_700_000_000_000,
      },
    ],
    nextBefore: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SetupService, useValue: mockSetupService },
        ActivityFeedService,
      ],
    });
    service = TestBed.inject(ActivityFeedService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProjectActivity', () => {
    it('GETs the project activity endpoint with no params by default', async () => {
      const promise = firstValueFrom(
        service.getProjectActivity('alice', 'my-book')
      );

      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/projects/alice/my-book'
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('limit')).toBe(false);
      expect(req.request.params.has('before')).toBe(false);
      expect(req.request.withCredentials).toBe(true);
      req.flush(projectResponse);

      const result = await promise;
      expect(result).toEqual(projectResponse);
    });

    it('passes limit and before params when provided', async () => {
      const promise = firstValueFrom(
        service.getProjectActivity('alice', 'my-book', {
          limit: 25,
          before: 1_699_000_000_000,
        })
      );

      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/projects/alice/my-book'
      );
      expect(req.request.params.get('limit')).toBe('25');
      expect(req.request.params.get('before')).toBe('1699000000000');
      req.flush(projectResponse);
      await promise;
    });

    it('passes only limit when before is omitted', async () => {
      const promise = firstValueFrom(
        service.getProjectActivity('alice', 'my-book', { limit: 10 })
      );
      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/projects/alice/my-book'
      );
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.has('before')).toBe(false);
      req.flush(projectResponse);
      await promise;
    });

    it('URL-encodes the username and slug', async () => {
      const promise = firstValueFrom(service.getProjectActivity('a b', 'c/d'));
      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/projects/a%20b/c%2Fd'
      );
      req.flush(projectResponse);
      await promise;
    });
  });

  describe('getMyActivity', () => {
    it('GETs /api/v1/activity/me with no params by default', async () => {
      const promise = firstValueFrom(service.getMyActivity());

      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/me'
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('limit')).toBe(false);
      expect(req.request.params.has('before')).toBe(false);
      expect(req.request.withCredentials).toBe(true);
      req.flush(userResponse);

      const result = await promise;
      expect(result).toEqual(userResponse);
    });

    it('passes limit and before params for pagination', async () => {
      const promise = firstValueFrom(
        service.getMyActivity({ limit: 8, before: 1_700_500_000_000 })
      );
      const req = httpController.expectOne(
        r => r.url === '/api/v1/activity/me'
      );
      expect(req.request.params.get('limit')).toBe('8');
      expect(req.request.params.get('before')).toBe('1700500000000');
      req.flush(userResponse);
      await promise;
    });
  });
});
