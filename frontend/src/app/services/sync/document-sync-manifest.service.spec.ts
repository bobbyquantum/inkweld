import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { DocumentSyncManifestService } from './document-sync-manifest.service';

describe('DocumentSyncManifestService', () => {
  let service: DocumentSyncManifestService;
  let httpMock: HttpTestingController;
  let logger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = { warn: vi.fn() };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DocumentSyncManifestService,
        {
          provide: SetupService,
          useValue: { getServerUrl: () => 'https://api.test' },
        },
        { provide: LoggerService, useValue: logger },
      ],
    });
    service = TestBed.inject(DocumentSyncManifestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('requests the manifest and returns the parsed body', async () => {
    const promise = service.getManifest('alice', 'my novel');
    const request = httpMock.expectOne(
      'https://api.test/api/v1/projects/alice/my%20novel/docs/sync-manifest'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);

    request.flush({
      documents: [{ documentId: 'alice:my novel:d1', revision: '42' }],
    });

    await expect(promise).resolves.toEqual({
      documents: [{ documentId: 'alice:my novel:d1', revision: '42' }],
    });
    httpMock.verify();
  });

  it('returns null and logs when the request fails', async () => {
    const promise = service.getManifest('alice', 'novel');
    httpMock
      .expectOne(
        'https://api.test/api/v1/projects/alice/novel/docs/sync-manifest'
      )
      .flush('nope', { status: 500, statusText: 'Server Error' });

    await expect(promise).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalled();
    httpMock.verify();
  });
});
