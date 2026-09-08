import { describe, expect, it, vi } from 'vitest';

import {
  RemoteAuthError,
  RemoteConflictError,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
} from '../remote-store.interface';
import { DropboxRemoteStore } from './dropbox-remote-store';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dropboxError(summary: string, status = 409): Response {
  return jsonResponse({ error_summary: summary, error: {} }, status);
}

describe('DropboxRemoteStore', () => {
  const getToken = vi.fn().mockResolvedValue('token');

  function createStore(fetchFn: typeof fetch): DropboxRemoteStore {
    return new DropboxRemoteStore(getToken, fetchFn);
  }

  describe('list', () => {
    it('maps the app-folder root to an empty path and follows pagination', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            entries: [
              {
                '.tag': 'file',
                name: 'a.json',
                path_display: '/a.json',
                rev: 'r1',
                size: 10,
              },
              { '.tag': 'folder', name: 'projects', path_display: '/projects' },
            ],
            cursor: 'c1',
            has_more: true,
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            entries: [
              {
                '.tag': 'file',
                name: 'b.json',
                path_display: '/b.json',
                rev: 'r2',
                size: 20,
              },
            ],
            cursor: 'c2',
            has_more: false,
          })
        );

      const files = await createStore(fetchFn).list('/');

      expect(files.map(f => f.path)).toEqual(['/a.json', '/b.json']);
      expect(files[0].version).toBe('r1');
      const firstBody = JSON.parse(
        (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string
      );
      expect(firstBody.path).toBe('');
      expect(
        (fetchFn.mock.calls[1] as [string, RequestInit])[0].endsWith(
          '/files/list_folder/continue'
        )
      ).toBe(true);
    });

    it('treats a missing folder as empty', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(dropboxError('path/not_found/...'));
      expect(await createStore(fetchFn).list('/nope')).toEqual([]);
    });
  });

  describe('stat', () => {
    it('returns file info or null for folders and missing paths', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            '.tag': 'file',
            name: 'm.json',
            path_display: '/m.json',
            rev: 'r9',
            size: 5,
            server_modified: '2026-09-07T10:00:00Z',
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({ '.tag': 'folder', name: 'd', path_display: '/d' })
        )
        .mockResolvedValueOnce(dropboxError('path/not_found/...'));
      const store = createStore(fetchFn);

      expect(await store.stat('/m.json')).toEqual({
        path: '/m.json',
        version: 'r9',
        size: 5,
        modifiedAt: '2026-09-07T10:00:00Z',
      });
      expect(await store.stat('/d')).toBeNull();
      expect(await store.stat('/missing')).toBeNull();
    });
  });

  describe('get', () => {
    it('downloads content with metadata', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(new TextEncoder().encode('{"v":1}'), {
          status: 200,
          headers: {
            'Dropbox-API-Result': JSON.stringify({
              '.tag': 'file',
              name: 'manifest.json',
              path_display: '/manifest.json',
              rev: 'r1',
              size: 7,
            }),
          },
        })
      );
      const file = await createStore(fetchFn).get('/manifest.json');
      expect(new TextDecoder().decode(file.content)).toBe('{"v":1}');
      expect(file.version).toBe('r1');
    });

    it('throws RemoteFileNotFoundError for a missing file', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(dropboxError('path/not_found/...'));
      await expect(createStore(fetchFn).get('/x')).rejects.toBeInstanceOf(
        RemoteFileNotFoundError
      );
    });

    it('maps throttling to RemoteRateLimitError with the requested delay', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error_summary: 'too_many_requests/', error: {} }),
            { status: 429, headers: { 'Retry-After': '5' } }
          )
        );
      const error = (await createStore(fetchFn)
        .get('/x')
        .catch(e => e)) as RemoteRateLimitError;
      expect(error).toBeInstanceOf(RemoteRateLimitError);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('throws RemoteAuthError when the token is rejected', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(dropboxError('invalid_access_token/...', 401));
      await expect(createStore(fetchFn).get('/x')).rejects.toBeInstanceOf(
        RemoteAuthError
      );
    });
  });

  describe('put', () => {
    it('encodes strings and returns the new version', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        jsonResponse({
          '.tag': 'file',
          name: 'a.json',
          path_display: '/a.json',
          rev: 'r2',
          size: 2,
        })
      );
      const info = await createStore(fetchFn).put('/a.json', '{}');
      expect(info.version).toBe('r2');
      const init = (fetchFn.mock.calls[0] as [string, RequestInit])[1];
      expect(ArrayBuffer.isView(init.body)).toBe(true);
      expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{}');
    });

    it('passes ifVersion through as an update rev and maps conflicts', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(dropboxError('path/conflict/file/...'));
      await expect(
        createStore(fetchFn).put('/a.json', '{}', { ifVersion: 'r1' })
      ).rejects.toBeInstanceOf(RemoteConflictError);
      const arg = JSON.parse(
        (
          (fetchFn.mock.calls[0] as [string, RequestInit])[1].headers as Record<
            string,
            string
          >
        )['Dropbox-API-Arg']
      );
      expect(arg.mode).toEqual({ '.tag': 'update', update: 'r1' });
    });
  });

  describe('delete', () => {
    it('ignores already-deleted files and maps throttling', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(dropboxError('path_lookup/not_found/...'))
        .mockResolvedValueOnce(dropboxError('too_many_write_operations', 429));
      const store = createStore(fetchFn);
      await expect(store.delete('/gone')).resolves.toBeUndefined();
      await expect(store.delete('/busy')).rejects.toBeInstanceOf(
        RemoteRateLimitError
      );
    });
  });
});
