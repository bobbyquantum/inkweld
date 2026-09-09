import { describe, expect, it, vi } from 'vitest';

import {
  appFolderPathname,
  basicAuthHeader,
  buildDavFilesRoot,
  buildDavUrl,
  davMkcol,
  davPropfind,
  davPut,
  type NextcloudCredentials,
  normalizeEtag,
  normalizeNextcloudServerUrl,
  parseMultistatus,
  WebDavError,
} from './webdav-api';

const creds: NextcloudCredentials = {
  serverUrl: 'https://cloud.example.com/nc',
  loginName: 'bobby quantum',
  appPassword: 'abcde-fghij',
};

const MULTISTATUS = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:response>
    <d:href>/nc/remote.php/dav/files/bobby%20quantum/Inkweld/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getetag>"folder-etag"</d:getetag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
    <d:propstat>
      <d:prop><d:getcontentlength/></d:prop>
      <d:status>HTTP/1.1 404 Not Found</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/nc/remote.php/dav/files/bobby%20quantum/Inkweld/manifest.json</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getetag>W/"abc123"</d:getetag>
        <d:getcontentlength>42</d:getcontentlength>
        <d:getlastmodified>Tue, 08 Sep 2026 10:00:00 GMT</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

describe('webdav-api', () => {
  describe('normalizeNextcloudServerUrl', () => {
    it('adds https, strips trailing slashes and pasted php entry points', () => {
      expect(normalizeNextcloudServerUrl('cloud.example.com')).toBe(
        'https://cloud.example.com'
      );
      expect(normalizeNextcloudServerUrl('https://cloud.example.com/')).toBe(
        'https://cloud.example.com'
      );
      expect(
        normalizeNextcloudServerUrl('https://host/nc/index.php/apps/files/')
      ).toBe('https://host/nc');
      expect(
        normalizeNextcloudServerUrl('https://host/remote.php/dav/files/bob/')
      ).toBe('https://host');
      expect(normalizeNextcloudServerUrl('http://localhost:8080/')).toBe(
        'http://localhost:8080'
      );
    });

    it('rejects empty and malformed input', () => {
      expect(() => normalizeNextcloudServerUrl('  ')).toThrow(
        'Enter your Nextcloud address'
      );
      expect(() => normalizeNextcloudServerUrl('http://')).toThrow(
        'valid Nextcloud address'
      );
    });
  });

  describe('URL building', () => {
    it('places the app folder under the encoded user files root', () => {
      expect(buildDavFilesRoot(creds)).toBe(
        'https://cloud.example.com/nc/remote.php/dav/files/bobby%20quantum/'
      );
      expect(buildDavUrl(creds, '/')).toBe(
        'https://cloud.example.com/nc/remote.php/dav/files/bobby%20quantum/Inkweld'
      );
      expect(buildDavUrl(creds, '/projects/bob/my story/elements.yjs')).toBe(
        'https://cloud.example.com/nc/remote.php/dav/files/bobby%20quantum/Inkweld/projects/bob/my%20story/elements.yjs'
      );
      expect(appFolderPathname(creds)).toBe(
        '/nc/remote.php/dav/files/bobby quantum/Inkweld/'
      );
    });

    it('builds a basic auth header from login name and app password', () => {
      expect(basicAuthHeader(creds)).toBe(
        `Basic ${btoa('bobby quantum:abcde-fghij')}`
      );
    });
  });

  describe('normalizeEtag', () => {
    it('strips quotes and weak validators', () => {
      expect(normalizeEtag('"abc"')).toBe('abc');
      expect(normalizeEtag('W/"abc"')).toBe('abc');
      expect(normalizeEtag(' abc ')).toBe('abc');
      expect(normalizeEtag(null)).toBe('');
    });
  });

  describe('parseMultistatus', () => {
    it('decodes hrefs and reads the 200 propstat only', () => {
      const entries = parseMultistatus(MULTISTATUS);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        pathname: '/nc/remote.php/dav/files/bobby quantum/Inkweld/',
        isCollection: true,
        etag: 'folder-etag',
        size: 0,
      });
      expect(entries[1]).toMatchObject({
        pathname:
          '/nc/remote.php/dav/files/bobby quantum/Inkweld/manifest.json',
        isCollection: false,
        etag: 'abc123',
        size: 42,
        modifiedAt: '2026-09-08T10:00:00.000Z',
      });
    });

    it('accepts absolute hrefs', () => {
      const xml = MULTISTATUS.replace(
        '<d:href>/nc/remote.php',
        '<d:href>https://cloud.example.com/nc/remote.php'
      );
      expect(parseMultistatus(xml)[0].pathname).toBe(
        '/nc/remote.php/dav/files/bobby quantum/Inkweld/'
      );
    });
  });

  describe('requests', () => {
    it('sends PROPFIND with depth, auth and the XHR marker', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(MULTISTATUS, {
          status: 207,
          headers: { 'Content-Type': 'application/xml' },
        })
      );

      const entries = await davPropfind(
        creds,
        buildDavUrl(creds, '/'),
        1,
        fetchFn
      );

      expect(entries).toHaveLength(2);
      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('PROPFIND');
      const headers = init.headers as Record<string, string>;
      expect(headers['Depth']).toBe('1');
      expect(headers['Authorization']).toBe(basicAuthHeader(creds));
      expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    });

    it('wraps non-2xx responses in WebDavError with the Retry-After', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(
          new Response('', { status: 429, headers: { 'Retry-After': '7' } })
        );

      const error = await davPropfind(
        creds,
        buildDavUrl(creds, '/'),
        0,
        fetchFn
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(WebDavError);
      expect((error as WebDavError).status).toBe(429);
      expect((error as WebDavError).isRateLimited).toBe(true);
      expect((error as WebDavError).retryAfterSeconds).toBe(7);
    });

    it('PUT quotes If-Match and prefers OC-ETag from the response', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'OC-ETag': '"new"', ETag: '"other"' },
        })
      );

      const result = await davPut(
        creds,
        buildDavUrl(creds, '/manifest.json'),
        new Uint8Array([1, 2]),
        { ifMatch: 'old' },
        fetchFn
      );

      expect(result.etag).toBe('new');
      const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['If-Match']).toBe(
        '"old"'
      );
    });

    it('MKCOL treats 405 (already exists) as success', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 405 }));
      await expect(
        davMkcol(creds, buildDavUrl(creds, '/'), fetchFn)
      ).resolves.toBeUndefined();
    });
  });
});
