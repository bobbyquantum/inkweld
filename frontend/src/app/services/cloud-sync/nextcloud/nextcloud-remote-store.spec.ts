import { describe, expect, it, vi } from 'vitest';

import {
  RemoteAuthError,
  RemoteConflictError,
  RemoteFileNotFoundError,
  RemoteRateLimitError,
} from '../remote-store.interface';
import {
  NextcloudRemoteStore,
  NextcloudUnreachableError,
} from './nextcloud-remote-store';
import { type NextcloudCredentials } from './webdav-api';

const creds: NextcloudCredentials = {
  serverUrl: 'https://cloud.example.com',
  loginName: 'bob',
  appPassword: 'pw',
};

const ROOT = '/remote.php/dav/files/bob/Inkweld';

function multistatus(
  entries: {
    href: string;
    collection?: boolean;
    etag?: string;
    size?: number;
  }[]
): Response {
  const body = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
${entries
  .map(
    e => `<d:response>
  <d:href>${e.href}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype>${e.collection ? '<d:collection/>' : ''}</d:resourcetype>
      <d:getetag>"${e.etag ?? 'e'}"</d:getetag>
      <d:getcontentlength>${e.size ?? 0}</d:getcontentlength>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`
  )
  .join('\n')}
</d:multistatus>`;
  return new Response(body, {
    status: 207,
    headers: { 'Content-Type': 'application/xml' },
  });
}

type Route = (url: string, init: RequestInit) => Response | undefined;

function createStore(routes: Route[]): {
  store: NextcloudRemoteStore;
  fetchFn: ReturnType<typeof vi.fn>;
} {
  const fetchFn = vi.fn((url: string, init: RequestInit) => {
    for (const route of routes) {
      const response = route(url, init);
      if (response) return Promise.resolve(response);
    }
    // Folders that a test did not model are taken to exist already
    if (init.method === 'MKCOL') {
      return Promise.resolve(new Response(null, { status: 405 }));
    }
    return Promise.resolve(new Response(`unrouted ${url}`, { status: 500 }));
  });
  const store = new NextcloudRemoteStore(
    () => Promise.resolve(creds),
    fetchFn as unknown as typeof fetch
  );
  return { store, fetchFn };
}

function decodePath(url: string): string {
  return decodeURIComponent(new URL(url).pathname);
}

describe('NextcloudRemoteStore', () => {
  describe('checkAccess', () => {
    it('resolves when the files root answers', async () => {
      const { store, fetchFn } = createStore([
        (url, init) =>
          init.method === 'PROPFIND' && url.endsWith('/files/bob/')
            ? multistatus([
                { href: '/remote.php/dav/files/bob/', collection: true },
              ])
            : undefined,
      ]);
      await expect(store.checkAccess()).resolves.toBeUndefined();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('maps 401 to RemoteAuthError', async () => {
      const { store } = createStore([() => new Response('', { status: 401 })]);
      await expect(store.checkAccess()).rejects.toBeInstanceOf(RemoteAuthError);
    });

    it('reports a network failure (CORS, offline) as unreachable', async () => {
      const fetchFn = vi
        .fn()
        .mockRejectedValue(new TypeError('Failed to fetch'));
      const store = new NextcloudRemoteStore(
        () => Promise.resolve(creds),
        fetchFn
      );
      await expect(store.checkAccess()).rejects.toBeInstanceOf(
        NextcloudUnreachableError
      );
    });
  });

  describe('list', () => {
    it('walks folders one level at a time and skips the self entry', async () => {
      const { store, fetchFn } = createStore([
        (url, init) => {
          if (init.method !== 'PROPFIND') return undefined;
          const path = decodePath(url);
          if (path === `${ROOT}/projects`) {
            return multistatus([
              { href: `${ROOT}/projects/`, collection: true },
              { href: `${ROOT}/projects/bob/`, collection: true },
            ]);
          }
          if (path === `${ROOT}/projects/bob`) {
            return multistatus([
              { href: `${ROOT}/projects/bob/`, collection: true },
              { href: `${ROOT}/projects/bob/my%20story/`, collection: true },
            ]);
          }
          if (path === `${ROOT}/projects/bob/my story`) {
            return multistatus([
              { href: `${ROOT}/projects/bob/my%20story/`, collection: true },
              {
                href: `${ROOT}/projects/bob/my%20story/project.json`,
                etag: 'p1',
                size: 12,
              },
              {
                href: `${ROOT}/projects/bob/my%20story/elements.yjs`,
                etag: 'e1',
                size: 300,
              },
            ]);
          }
          return undefined;
        },
      ]);

      const files = await store.list('/projects', { recursive: true });

      expect(files.map(f => f.path).sort()).toEqual([
        '/projects/bob/my story/elements.yjs',
        '/projects/bob/my story/project.json',
      ]);
      expect(files.find(f => f.path.endsWith('elements.yjs'))).toMatchObject({
        version: 'e1',
        size: 300,
      });
      const depths = (fetchFn.mock.calls as [string, RequestInit][]).map(
        ([, init]) => (init.headers as Record<string, string>)['Depth']
      );
      expect(new Set(depths)).toEqual(new Set(['1']));
    });

    it('does not descend when not recursive', async () => {
      const { store, fetchFn } = createStore([
        () =>
          multistatus([
            { href: `${ROOT}/`, collection: true },
            { href: `${ROOT}/manifest.json`, etag: 'm1', size: 5 },
            { href: `${ROOT}/projects/`, collection: true },
          ]),
      ]);

      const files = await store.list('/');

      expect(files.map(f => f.path)).toEqual(['/manifest.json']);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('treats a missing folder as empty', async () => {
      const { store } = createStore([() => new Response('', { status: 404 })]);
      await expect(
        store.list('/projects', { recursive: true })
      ).resolves.toEqual([]);
    });
  });

  describe('stat', () => {
    it('returns file info for a file and null for a folder or 404', async () => {
      const { store } = createStore([
        (url, init) => {
          if (init.method !== 'PROPFIND') return undefined;
          const path = decodePath(url);
          if (path === `${ROOT}/manifest.json`) {
            return multistatus([
              { href: `${ROOT}/manifest.json`, etag: 'm2', size: 9 },
            ]);
          }
          if (path === `${ROOT}/projects`) {
            return multistatus([
              { href: `${ROOT}/projects/`, collection: true },
            ]);
          }
          return new Response('', { status: 404 });
        },
      ]);

      expect(await store.stat('/manifest.json')).toEqual({
        path: '/manifest.json',
        version: 'm2',
        size: 9,
        modifiedAt: undefined,
      });
      expect(await store.stat('/projects')).toBeNull();
      expect(await store.stat('/nope.json')).toBeNull();
    });
  });

  describe('get', () => {
    it('downloads bytes with the ETag as version', async () => {
      const { store } = createStore([
        (url, init) =>
          init.method === 'GET'
            ? new Response(new Uint8Array([7, 8, 9]), {
                status: 200,
                headers: { ETag: '"g1"' },
              })
            : undefined,
      ]);

      const file = await store.get('/manifest.json');

      expect(Array.from(file.content)).toEqual([7, 8, 9]);
      expect(file.version).toBe('g1');
      expect(file.size).toBe(3);
    });

    it('throws RemoteFileNotFoundError on 404', async () => {
      const { store } = createStore([() => new Response('', { status: 404 })]);
      await expect(store.get('/missing')).rejects.toBeInstanceOf(
        RemoteFileNotFoundError
      );
    });
  });

  describe('put', () => {
    it('uploads and returns the new ETag', async () => {
      const { store, fetchFn } = createStore([
        (_url, init) =>
          init.method === 'PUT'
            ? new Response(null, {
                status: 201,
                headers: { 'OC-ETag': '"n1"' },
              })
            : undefined,
      ]);

      const info = await store.put('/manifest.json', '{}', { ifVersion: 'm1' });

      expect(info.version).toBe('n1');
      expect(info.size).toBe(2);
      const putCall = (fetchFn.mock.calls as [string, RequestInit][]).find(
        ([, init]) => init.method === 'PUT'
      )!;
      expect((putCall[1].headers as Record<string, string>)['If-Match']).toBe(
        '"m1"'
      );
    });

    it('creates unknown parent folders up front, then remembers them', async () => {
      let putCount = 0;
      const mkcols: string[] = [];
      const { store } = createStore([
        (url, init) => {
          if (init.method === 'MKCOL') {
            mkcols.push(decodePath(url));
            // Existing folders answer 405; new ones 201
            return new Response(null, {
              status: decodePath(url) === ROOT ? 405 : 201,
            });
          }
          if (init.method === 'PUT') {
            putCount++;
            return new Response(null, {
              status: 201,
              headers: { 'OC-ETag': `"n${putCount}"` },
            });
          }
          return undefined;
        },
      ]);

      const first = await store.put(
        '/projects/bob/story/documents/d1.yjs',
        new Uint8Array([1])
      );
      expect(first.version).toBe('n1');
      expect(mkcols).toEqual([
        ROOT,
        `${ROOT}/projects`,
        `${ROOT}/projects/bob`,
        `${ROOT}/projects/bob/story`,
        `${ROOT}/projects/bob/story/documents`,
      ]);

      // Same folder again: one request, no MKCOL chatter
      mkcols.length = 0;
      const second = await store.put(
        '/projects/bob/story/documents/d2.yjs',
        new Uint8Array([2])
      );
      expect(second.version).toBe('n2');
      expect(mkcols).toEqual([]);

      // A sibling folder only creates the missing tail
      const third = await store.put(
        '/projects/bob/story/worldbuilding/w1.yjs',
        new Uint8Array([3])
      );
      expect(third.version).toBe('n3');
      expect(mkcols).toEqual([`${ROOT}/projects/bob/story/worldbuilding`]);
      expect(putCount).toBe(3);
    });

    it('folders seen in a listing are treated as known', async () => {
      const mkcols: string[] = [];
      const { store } = createStore([
        (url, init) => {
          if (init.method === 'PROPFIND') {
            return multistatus([
              { href: `${ROOT}/projects/`, collection: true },
              { href: `${ROOT}/projects/bob/`, collection: true },
            ]);
          }
          if (init.method === 'MKCOL') {
            mkcols.push(decodePath(url));
            return new Response(null, { status: 201 });
          }
          if (init.method === 'PUT') {
            return new Response(null, {
              status: 201,
              headers: { 'OC-ETag': '"x"' },
            });
          }
          return undefined;
        },
      ]);

      await store.list('/projects');
      await store.put('/projects/bob/story/elements.yjs', '{}');

      // "/", "/projects" and "/projects/bob" were listed; only "story" is new
      expect(mkcols).toEqual([`${ROOT}/projects/bob/story`]);
    });

    it('recreates folders when a PUT into a known folder still fails (409 or 404)', async () => {
      // Someone deleted the folder on the server after we listed it
      for (const status of [409, 404]) {
        let putCount = 0;
        const mkcols: string[] = [];
        const { store } = createStore([
          (url, init) => {
            if (init.method === 'PROPFIND') {
              return multistatus([{ href: `${ROOT}/`, collection: true }]);
            }
            if (init.method === 'MKCOL') {
              mkcols.push(decodePath(url));
              return new Response(null, { status: 201 });
            }
            if (init.method === 'PUT') {
              putCount++;
              return putCount === 1
                ? new Response('', { status })
                : new Response(null, {
                    status: 201,
                    headers: { 'OC-ETag': '"m1"' },
                  });
            }
            return undefined;
          },
        ]);
        await store.list('/'); // marks "/" as known, so PUT goes first

        const info = await store.put('/manifest.json', '{}');

        expect(info.version).toBe('m1');
        expect(putCount).toBe(2);
        expect(mkcols).toEqual([ROOT]);
      }
    });

    it('maps 412 to RemoteConflictError', async () => {
      const { store } = createStore([() => new Response('', { status: 412 })]);
      await expect(
        store.put('/manifest.json', '{}', { ifVersion: 'stale' })
      ).rejects.toBeInstanceOf(RemoteConflictError);
    });

    it('falls back to stat when the response carries no ETag', async () => {
      const { store } = createStore([
        (url, init) => {
          if (init.method === 'PUT') return new Response(null, { status: 204 });
          if (init.method === 'PROPFIND') {
            return multistatus([
              { href: `${ROOT}/manifest.json`, etag: 'from-stat', size: 2 },
            ]);
          }
          return undefined;
        },
      ]);

      const info = await store.put('/manifest.json', '{}');

      expect(info.version).toBe('from-stat');
    });

    it('maps 429 to RemoteRateLimitError with the retry delay', async () => {
      const { store } = createStore([
        () =>
          new Response('', { status: 429, headers: { 'Retry-After': '3' } }),
      ]);
      const error = await store.put('/x', '1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRateLimitError);
      expect((error as RemoteRateLimitError).retryAfterMs).toBe(3000);
    });
  });

  describe('delete', () => {
    it('ignores 404 and propagates auth failures', async () => {
      const { store: gone } = createStore([
        () => new Response('', { status: 404 }),
      ]);
      await expect(gone.delete('/projects/bob/old')).resolves.toBeUndefined();

      const { store: denied } = createStore([
        () => new Response('', { status: 403 }),
      ]);
      await expect(denied.delete('/projects/bob/old')).rejects.toBeInstanceOf(
        RemoteAuthError
      );
    });
  });
});
