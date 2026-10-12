import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RemoteAuthError,
  RemoteConflictError,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
} from '../remote-store.interface';
import {
  driveErrorResponse,
  FakeGoogleDrive,
} from '../testing/fake-google-drive';
import { SIMPLE_UPLOAD_LIMIT } from './google-drive-api';
import {
  GoogleDriveRemoteStore,
  INDEX_FRESHNESS_MS,
} from './google-drive-remote-store';

describe('GoogleDriveRemoteStore', () => {
  let drive: FakeGoogleDrive;
  let now: number;
  let store: GoogleDriveRemoteStore;
  const getToken = vi.fn().mockResolvedValue('token');

  beforeEach(() => {
    drive = new FakeGoogleDrive();
    now = 1_000_000;
    store = new GoogleDriveRemoteStore(getToken, drive.fetch, () => now);
  });

  describe('list', () => {
    beforeEach(() => {
      drive.externalWrite('/manifest.json', '{}');
      drive.externalWrite('/projects/alice/novel/project.json', '{}');
      drive.externalWrite('/projects/alice/novel/documents/d1.yjs', 'a');
      drive.externalWrite('/projects/alice/novel2/project.json', '{}');
    });

    it('builds the index from a paged listing of the app data folder', async () => {
      drive.pageSize = 1;

      const files = await store.list('/', { recursive: true });

      expect(files.map(f => f.path).sort()).toEqual(drive.namesInOrder());
      expect(drive.count('GET /drive/v3/files')).toBe(4);
      expect(drive.count('GET /drive/v3/changes/startPageToken')).toBe(1);
    });

    it('lists direct children only unless recursive', async () => {
      const shallow = await store.list('/projects/alice/novel');
      const deep = await store.list('/projects/alice/novel/', {
        recursive: true,
      });

      expect(shallow.map(f => f.path)).toEqual([
        '/projects/alice/novel/project.json',
      ]);
      expect(deep.map(f => f.path).sort()).toEqual([
        '/projects/alice/novel/documents/d1.yjs',
        '/projects/alice/novel/project.json',
      ]);
    });

    it('returns an empty list for a folder with no files', async () => {
      expect(await store.list('/nope', { recursive: true })).toEqual([]);
    });

    it('reports size, version and modification time', async () => {
      const [file] = await store.list('/projects/alice/novel/documents');

      expect(file.size).toBe(1);
      expect(file.version).toMatch(/^rev-/);
      expect(file.modifiedAt).toBeDefined();
    });

    it('picks up remote changes through the Changes API', async () => {
      await store.list('/', { recursive: true });
      drive.externalWrite('/projects/alice/novel/documents/d2.yjs', 'b');
      drive.externalDelete('/projects/alice/novel2/project.json');

      const files = await store.list('/projects', { recursive: true });

      expect(files.map(f => f.path).sort()).toEqual([
        '/projects/alice/novel/documents/d1.yjs',
        '/projects/alice/novel/documents/d2.yjs',
        '/projects/alice/novel/project.json',
      ]);
      expect(drive.count('GET /drive/v3/files')).toBe(1);
      expect(drive.countExact('GET /drive/v3/changes')).toBe(1);
    });

    it('follows paged changes', async () => {
      await store.list('/');
      drive.pageSize = 1;
      drive.externalWrite('/a.json', '1');
      drive.externalWrite('/b.json', '2');
      drive.externalWrite('/c.json', '3');

      const files = await store.list('/');

      expect(files.map(f => f.path).sort()).toEqual([
        '/a.json',
        '/b.json',
        '/c.json',
        '/manifest.json',
      ]);
    });

    it('rebuilds the index when the page token has expired', async () => {
      await store.list('/');
      drive.externalWrite('/late.json', '1');
      drive.expirePageTokens();

      const files = await store.list('/');

      expect(files.map(f => f.path).sort()).toEqual([
        '/late.json',
        '/manifest.json',
      ]);
      expect(drive.count('GET /drive/v3/changes/startPageToken')).toBe(2);
    });
  });

  describe('stat', () => {
    it('returns null for a missing path and info for an existing one', async () => {
      drive.externalWrite('/manifest.json', '{"a":1}');

      expect(await store.stat('/missing.json')).toBeNull();
      expect(await store.stat('/manifest.json')).toMatchObject({
        path: '/manifest.json',
        size: 7,
      });
    });

    it('trusts the index for a few seconds, then polls again', async () => {
      await store.stat('/manifest.json');
      drive.externalWrite('/manifest.json', '{}');

      expect(await store.stat('/manifest.json')).toBeNull();

      now += INDEX_FRESHNESS_MS;
      expect(await store.stat('/manifest.json')).not.toBeNull();
    });

    it('shares one index build between concurrent callers', async () => {
      await Promise.all([store.stat('/a'), store.stat('/b'), store.list('/')]);

      expect(drive.count('GET /drive/v3/changes/startPageToken')).toBe(1);
      expect(drive.count('GET /drive/v3/files')).toBe(1);
    });
  });

  describe('get', () => {
    it('downloads content with the indexed version', async () => {
      const meta = drive.externalWrite('/manifest.json', 'hello');

      const file = await store.get('/manifest.json');

      expect(new TextDecoder().decode(file.content)).toBe('hello');
      expect(file.version).toBe(meta.headRevisionId);
    });

    it('throws RemoteFileNotFoundError for a missing path', async () => {
      await expect(store.get('/missing.json')).rejects.toBeInstanceOf(
        RemoteFileNotFoundError
      );
    });

    it('re-polls and follows a file replaced since the last poll', async () => {
      drive.externalWrite('/manifest.json', 'old');
      await store.list('/');
      drive.externalDelete('/manifest.json');
      drive.externalCreate('/manifest.json', 'new');

      const file = await store.get('/manifest.json');

      expect(new TextDecoder().decode(file.content)).toBe('new');
    });

    it('reports a file deleted since the last poll as not found', async () => {
      drive.externalWrite('/manifest.json', 'old');
      await store.list('/');
      drive.externalDelete('/manifest.json');

      await expect(store.get('/manifest.json')).rejects.toBeInstanceOf(
        RemoteFileNotFoundError
      );
    });
  });

  describe('put', () => {
    it('creates a file in the app data folder named by its path', async () => {
      const info = await store.put('/projects/a/s/project.json', '{"x":1}');

      expect(drive.text('/projects/a/s/project.json')).toBe('{"x":1}');
      expect(info).toMatchObject({
        path: '/projects/a/s/project.json',
        size: 7,
      });
      expect(await store.stat('/projects/a/s/project.json')).toEqual(info);
    });

    it('keeps binary content intact', async () => {
      const bytes = Uint8Array.from([0, 13, 10, 45, 45, 255, 128]);

      await store.put('/media/blob', bytes);

      const file = await store.get('/media/blob');
      expect(Array.from(file.content)).toEqual(Array.from(bytes));
    });

    it('updates the existing file instead of creating another', async () => {
      const first = await store.put('/manifest.json', 'one');
      const second = await store.put('/manifest.json', 'two');

      expect(drive.files.size).toBe(1);
      expect(drive.text('/manifest.json')).toBe('two');
      expect(second.version).not.toBe(first.version);
      expect(drive.count('PATCH /upload/drive/v3/files')).toBe(1);
    });

    it('re-polls before creating so a file from another device is updated', async () => {
      await store.list('/');
      drive.externalWrite('/manifest.json', 'theirs');

      await store.put('/manifest.json', 'mine');

      expect(drive.files.size).toBe(1);
      expect(drive.text('/manifest.json')).toBe('mine');
    });

    it('creates one file when the same new path is written concurrently', async () => {
      await Promise.all([
        store.put('/manifest.json', 'a'),
        store.put('/manifest.json', 'b'),
      ]);

      expect(drive.files.size).toBe(1);
      expect(drive.text('/manifest.json')).toBe('b');
    });

    it('recreates a file deleted after it was indexed', async () => {
      drive.externalWrite('/manifest.json', 'old');
      await store.list('/');
      drive.externalDelete('/manifest.json');

      await store.put('/manifest.json', 'new');

      expect(drive.text('/manifest.json')).toBe('new');
    });

    it('uploads large files through a resumable session', async () => {
      const big = new Uint8Array(SIMPLE_UPLOAD_LIMIT + 1).fill(7);

      await store.put('/media/big', big);
      await store.put('/media/big', big.subarray(0, SIMPLE_UPLOAD_LIMIT + 1));

      expect(drive.count('POST /upload/drive/v3/files')).toBe(1);
      expect(drive.count('PATCH /upload/drive/v3/files')).toBe(1);
      expect(drive.count('PUT /session/')).toBe(2);
      expect(drive.files.size).toBe(1);
      expect([...drive.files.values()][0].content.byteLength).toBe(
        SIMPLE_UPLOAD_LIMIT + 1
      );
    });

    describe('ifVersion', () => {
      it('writes when the live version matches', async () => {
        const { version } = await store.put('/manifest.json', 'one');

        await store.put('/manifest.json', 'two', { ifVersion: version });

        expect(drive.text('/manifest.json')).toBe('two');
      });

      it('checks the live version, not the index', async () => {
        const { version } = await store.put('/manifest.json', 'one');
        drive.externalWrite('/manifest.json', 'theirs');

        await expect(
          store.put('/manifest.json', 'mine', { ifVersion: version })
        ).rejects.toBeInstanceOf(RemoteConflictError);
        expect(drive.text('/manifest.json')).toBe('theirs');

        // The conflict refreshed the index, so a re-read sees their version
        const reread = await store.get('/manifest.json');
        await store.put('/manifest.json', 'merged', {
          ifVersion: reread.version,
        });
        expect(drive.text('/manifest.json')).toBe('merged');
      });

      it('conflicts when the file no longer exists', async () => {
        const { version } = await store.put('/manifest.json', 'one');
        drive.externalDelete('/manifest.json');

        await expect(
          store.put('/manifest.json', 'two', { ifVersion: version })
        ).rejects.toBeInstanceOf(RemoteConflictError);
        expect(drive.files.size).toBe(0);
      });

      it('treats an empty ifVersion as "must not exist yet"', async () => {
        await store.put('/manifest.json', 'one', { ifVersion: '' });

        await expect(
          store.put('/manifest.json', 'two', { ifVersion: '' })
        ).rejects.toBeInstanceOf(RemoteConflictError);
        expect(drive.text('/manifest.json')).toBe('one');
      });
    });
  });

  describe('duplicate names', () => {
    beforeEach(() => {
      drive.externalCreate('/manifest.json', 'first');
      drive.externalCreate('/manifest.json', 'second');
    });

    it('reads the oldest file', async () => {
      const [listed] = await store.list('/');
      const file = await store.get('/manifest.json');

      expect(new TextDecoder().decode(file.content)).toBe('first');
      expect(listed.version).toBe(file.version);
    });

    it('writes the oldest file and removes the others', async () => {
      await store.put('/manifest.json', 'merged');

      expect(drive.files.size).toBe(1);
      expect(drive.text('/manifest.json')).toBe('merged');
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      drive.externalWrite('/projects/alice/novel/project.json', '{}');
      drive.externalWrite('/projects/alice/novel/media/m1', 'x');
      drive.externalWrite('/projects/alice/novel2/project.json', '{}');
    });

    it('removes a folder and everything under it', async () => {
      await store.delete('/projects/alice/novel');

      expect(drive.namesInOrder()).toEqual([
        '/projects/alice/novel2/project.json',
      ]);
      expect(await store.list('/projects', { recursive: true })).toHaveLength(
        1
      );
    });

    it('removes a single file', async () => {
      await store.delete('/projects/alice/novel/media/m1');

      expect(drive.namesInOrder()).toEqual([
        '/projects/alice/novel/project.json',
        '/projects/alice/novel2/project.json',
      ]);
    });

    it('succeeds when the path is absent or already deleted', async () => {
      await store.list('/');
      drive.failNext(
        method => method === 'DELETE',
        () => driveErrorResponse(404, 'notFound')
      );

      await store.delete('/projects/alice/novel/media/m1');
      await store.delete('/nothing/here');

      expect(drive.namesInOrder()).toContain(
        '/projects/alice/novel/project.json'
      );
    });
  });

  describe('error mapping', () => {
    it('maps 401 to RemoteAuthError', async () => {
      drive.failNext(
        () => true,
        () => driveErrorResponse(401, 'authError')
      );

      await expect(store.list('/')).rejects.toBeInstanceOf(RemoteAuthError);
    });

    it('maps a 403 rate limit with Retry-After to RemoteRateLimitError', async () => {
      drive.failNext(
        () => true,
        () =>
          driveErrorResponse(403, 'userRateLimitExceeded', {
            'Retry-After': '7',
          })
      );

      const error = await store.stat('/x').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RemoteRateLimitError);
      expect((error as RemoteRateLimitError).retryAfterMs).toBe(7000);
    });

    it('defaults the back-off for a 429 without Retry-After', async () => {
      await store.list('/');
      drive.failNext(
        method => method === 'POST',
        () => driveErrorResponse(429, 'rateLimitExceeded')
      );

      const error = await store
        .put('/manifest.json', 'x')
        .catch((e: unknown) => e);

      expect((error as RemoteRateLimitError).retryAfterMs).toBe(10_000);
    });

    it('passes other errors through and recovers on the next call', async () => {
      drive.failNext(
        () => true,
        () => driveErrorResponse(500, 'backendError')
      );

      await expect(store.list('/')).rejects.toThrow(/500/);
      await expect(store.list('/')).resolves.toEqual([]);
    });

    it('does not treat a 403 permission error as a rate limit', async () => {
      drive.failNext(
        () => true,
        () => driveErrorResponse(403, 'insufficientPermissions')
      );

      const error = await store.list('/').catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(RemoteRateLimitError);
      expect(error).not.toBeInstanceOf(RemoteAuthError);
    });
  });
});
