import { describe, expect, it, vi } from 'vitest';

import { driveErrorResponse } from '../testing/fake-google-drive';
import {
  createAppDataFile,
  DriveApiError,
  getDriveFileMetadata,
  listAppDataChanges,
  listAppDataFiles,
  SIMPLE_UPLOAD_LIMIT,
  updateDriveFileContent,
} from './google-drive-api';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function call(fetchFn: ReturnType<typeof vi.fn>, index = 0) {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return { url: new URL(url), init };
}

describe('google-drive-api', () => {
  describe('DriveApiError', () => {
    it('reads the reason, message and Retry-After from a Drive error', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        driveErrorResponse(403, 'userRateLimitExceeded', {
          'Retry-After': '3',
        })
      );

      const error = (await getDriveFileMetadata('t', 'id', fetchFn).catch(
        (e: unknown) => e
      )) as DriveApiError;

      expect(error).toBeInstanceOf(DriveApiError);
      expect(error.reason).toBe('userRateLimitExceeded');
      expect(error.retryAfterSeconds).toBe(3);
      expect(error.isRateLimited).toBe(true);
      expect(error.message).toContain('files.get');
    });

    it('falls back to the body text when it is not JSON', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(new Response('upstream broke', { status: 502 }));

      const error = (await getDriveFileMetadata('t', 'id', fetchFn).catch(
        (e: unknown) => e
      )) as DriveApiError;

      expect(error.status).toBe(502);
      expect(error.message).toContain('upstream broke');
      expect(error.isRateLimited).toBe(false);
    });

    it('classifies expired page tokens', () => {
      expect(new DriveApiError(410, '', 'gone').isInvalidPageToken).toBe(true);
      expect(
        new DriveApiError(400, 'invalidPageToken', 'bad').isInvalidPageToken
      ).toBe(true);
      expect(new DriveApiError(500, '', 'x').isInvalidPageToken).toBe(false);
    });
  });

  it('lists only the app data folder, sending the auth header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));

    await listAppDataFiles('tok', 'next', fetchFn);

    const { url, init } = call(fetchFn);
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(url.searchParams.get('pageToken')).toBe('next');
    expect(url.searchParams.get('fields')).toContain('headRevisionId');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok'
    );
  });

  it('asks the Changes API for removals in the app data folder', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ changes: [] }));

    await listAppDataChanges('tok', '42', fetchFn);

    const { url } = call(fetchFn);
    expect(url.pathname).toBe('/drive/v3/changes');
    expect(url.searchParams.get('pageToken')).toBe('42');
    expect(url.searchParams.get('spaces')).toBe('appDataFolder');
    expect(url.searchParams.get('includeRemoved')).toBe('true');
  });

  it('creates small files with one multipart request into appDataFolder', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'f1', name: '/a.json' }));

    await createAppDataFile('tok', '/a.json', new Uint8Array([1, 2]), fetchFn);

    const { url, init } = call(fetchFn);
    expect(url.searchParams.get('uploadType')).toBe('multipart');
    const contentType = (init.headers as Record<string, string>)[
      'Content-Type'
    ];
    expect(contentType).toMatch(/^multipart\/related; boundary=/);
    const text = await (init.body as Blob).text();
    expect(text).toContain('"parents":["appDataFolder"]');
    expect(text).toContain('"name":"/a.json"');
  });

  it('fails clearly when a resumable session has no Location', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));

    const error = (await updateDriveFileContent(
      'tok',
      'f1',
      new Uint8Array(SIMPLE_UPLOAD_LIMIT + 1),
      fetchFn
    ).catch((e: unknown) => e)) as DriveApiError;

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.reason).toBe('noSessionUri');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
