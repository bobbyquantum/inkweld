import { afterEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import {
  defaultPublicServerUrl,
  normalizePublicServer,
  publicProjectKey,
  publicProjectUrl,
  publicServerFromSearch,
} from './public-project-link';

/** A document served from `base`, like one with a `<base href>` */
function documentAt(base: string): Document {
  const doc = document.implementation.createHTMLDocument('test');
  const baseEl = doc.createElement('base');
  baseEl.setAttribute('href', base);
  doc.head.appendChild(baseEl);
  return doc;
}

describe('public project links', () => {
  const originalApiUrl = environment.apiUrl;
  afterEach(() => {
    environment.apiUrl = originalApiUrl;
  });

  describe('publicProjectUrl', () => {
    it('is just the path when the project is on the build’s own API', () => {
      environment.apiUrl = 'https://api.example.com/';
      expect(
        publicProjectUrl(
          'alice',
          'my story',
          'https://api.example.com',
          documentAt('https://app.example.com/')
        )
      ).toBe('https://app.example.com/public/alice/my%20story');
    });

    it('is just the path when the app and its API share an origin', () => {
      environment.apiUrl = '';
      expect(
        publicProjectUrl(
          'alice',
          'story',
          'https://self.example.com',
          documentAt('https://self.example.com/')
        )
      ).toBe('https://self.example.com/public/alice/story');
    });

    it('names the server when the app is served from a different address', () => {
      environment.apiUrl = '';
      expect(
        publicProjectUrl(
          'bobbyquantum',
          'dustmote-rising',
          'https://api.example.com/',
          documentAt('https://app.example.com/')
        )
      ).toBe(
        'https://app.example.com/public/bobbyquantum/dustmote-rising?server=https%3A%2F%2Fapi.example.com'
      );
    });

    it('leaves out a server it cannot use', () => {
      environment.apiUrl = '';
      expect(
        publicProjectUrl('a', 'b', '', documentAt('https://app.example.com/'))
      ).toBe('https://app.example.com/public/a/b');
    });

    it('keeps a path prefix the app is served under', () => {
      environment.apiUrl = '';
      expect(
        publicProjectUrl(
          'a',
          'b',
          'https://api.example.com',
          documentAt('https://host.example.com/inkweld/')
        )
      ).toBe(
        'https://host.example.com/inkweld/public/a/b?server=https%3A%2F%2Fapi.example.com'
      );
    });
  });

  describe('the server a link names', () => {
    it('accepts http(s) servers as origin and path', () => {
      expect(
        publicServerFromSearch('?server=https%3A%2F%2Fapi.example.com%2Fx%2F')
      ).toBe('https://api.example.com/x');
      expect(normalizePublicServer('http://192.168.2.162:8333')).toBe(
        'http://192.168.2.162:8333'
      );
    });

    it('drops credentials, query and fragment', () => {
      expect(
        normalizePublicServer('https://user:pass@api.example.com/?a=1#b')
      ).toBe('https://api.example.com');
    });

    it('refuses anything that is not an http(s) URL', () => {
      for (const value of [
        null,
        '',
        'not a url',
        'javascript:alert(1)',
        'data:text/html,hi',
        'ftp://files.example.com',
      ]) {
        expect(normalizePublicServer(value)).toBeNull();
      }
      expect(publicServerFromSearch('?other=1')).toBeNull();
    });
  });

  describe('publicProjectKey', () => {
    it('reads username and slug from public paths', () => {
      expect(publicProjectKey('/public/alice/story')).toBe('alice/story');
      expect(publicProjectKey('/public/alice/story/document/x?server=y')).toBe(
        'alice/story'
      );
      expect(publicProjectKey('/public/a%20b/c#frag')).toBe('a%20b/c');
    });

    it('is null for other paths', () => {
      for (const path of [
        '/alice/public/story',
        '/public/alice',
        '/public/alice/',
        '/public//story',
        'public/alice/story',
        '/',
      ]) {
        expect(publicProjectKey(path)).toBeNull();
      }
    });
  });

  it('defaults to the page origin under Home Assistant ingress', () => {
    environment.apiUrl = 'https://api.example.com';
    const doc = documentAt('https://ha.local/api/hassio_ingress/abc123/');
    const meta = doc.createElement('meta');
    meta.setAttribute('name', 'inkweld-ingress');
    doc.head.appendChild(meta);

    expect(defaultPublicServerUrl(doc)).toBe(
      'https://ha.local/api/hassio_ingress/abc123'
    );
  });
});
