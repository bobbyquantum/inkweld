import { describe, expect, it } from 'vitest';

import { isUrlOnServer, serverAddress } from './server-address';

describe('server-address', () => {
  describe('serverAddress', () => {
    it('lowercases the scheme and host and drops trailing slashes', () => {
      expect(serverAddress('HTTPS://Ink.Example.COM/')).toBe(
        'https://ink.example.com'
      );
    });

    it('drops default ports and keeps others', () => {
      expect(serverAddress('https://ink.example.com:443')).toBe(
        'https://ink.example.com'
      );
      expect(serverAddress('http://localhost:8333/')).toBe(
        'http://localhost:8333'
      );
    });

    it('keeps the path, so servers under different prefixes differ', () => {
      expect(serverAddress('https://example.com/inkweld-a/')).toBe(
        'https://example.com/inkweld-a'
      );
      expect(serverAddress('https://example.com/inkweld-a')).not.toBe(
        serverAddress('https://example.com/inkweld-b')
      );
      expect(serverAddress('https://example.com/inkweld-a')).not.toBe(
        serverAddress('https://example.com')
      );
    });

    it('keeps the case of the path', () => {
      expect(serverAddress('https://example.com/Ink')).toBe(
        'https://example.com/Ink'
      );
    });

    it('falls back to the lowercased text for an unparseable URL', () => {
      expect(serverAddress('Not A URL//')).toBe('not a url');
    });
  });

  describe('isUrlOnServer', () => {
    const base = 'https://app.example.com/';

    it('matches absolute URLs on a server at the root of its origin', () => {
      const server = 'https://api.example.com';
      expect(isUrlOnServer('https://api.example.com/api/v1/x', server)).toBe(
        true
      );
      expect(isUrlOnServer('https://API.example.com:443/', server)).toBe(true);
      expect(isUrlOnServer('https://api.example.com', server)).toBe(true);
    });

    it('rejects other origins', () => {
      const server = 'https://api.example.com';
      expect(isUrlOnServer('https://other.example.com/api', server)).toBe(
        false
      );
      expect(isUrlOnServer('http://api.example.com/api', server)).toBe(false);
      expect(isUrlOnServer('https://api.example.com:8443/api', server)).toBe(
        false
      );
      expect(
        isUrlOnServer('https://api.example.com.other.test/api', server)
      ).toBe(false);
    });

    it('matches only paths inside a path-prefixed server', () => {
      const server = 'https://example.com/inkweld/';
      expect(isUrlOnServer('https://example.com/inkweld', server)).toBe(true);
      expect(
        isUrlOnServer('https://example.com/inkweld/api/v1/x', server)
      ).toBe(true);
      expect(isUrlOnServer('https://example.com/api/v1/x', server)).toBe(false);
      expect(isUrlOnServer('https://example.com/inkweld-b/api', server)).toBe(
        false
      );
      expect(isUrlOnServer('https://example.com/', server)).toBe(false);
    });

    it('does not let dot segments leave the prefix', () => {
      const server = 'https://example.com/inkweld';
      expect(
        isUrlOnServer('https://example.com/inkweld/../other/api', server)
      ).toBe(false);
      expect(
        isUrlOnServer('https://example.com/inkweld/%2e%2e/other/api', server)
      ).toBe(false);
    });

    it('rejects dot segments hidden behind encoded separators', () => {
      // A proxy that decodes the path before routing it would leave the prefix
      const server = 'https://host.example/inkweld-a';
      expect(
        isUrlOnServer(
          'https://host.example/inkweld-a/api/v1/users/..%2F..%2F..%2F..%2Finkweld-b%2Fx/profile',
          server
        )
      ).toBe(false);
      expect(
        isUrlOnServer(
          'https://host.example/inkweld-a/api/%2e%2e%2f%2e%2e%2finkweld-b',
          server
        )
      ).toBe(false);
      expect(
        isUrlOnServer(
          'https://host.example/inkweld-a/api/..%5C..%5Cinkweld-b',
          server
        )
      ).toBe(false);
      expect(
        isUrlOnServer('https://host.example/inkweld-a/api/.%2E%2Fx', server)
      ).toBe(false);
      expect(
        isUrlOnServer(
          'wss://host.example/inkweld-a/api/v1/ws/..%2f..%2f..%2finkweld-b',
          server
        )
      ).toBe(false);
    });

    it('keeps encoded separators that stay inside the prefix', () => {
      const server = 'https://host.example/inkweld-a';
      expect(
        isUrlOnServer(
          'https://host.example/inkweld-a/api/v1/media/a%2Fb..png',
          server
        )
      ).toBe(true);
      expect(
        isUrlOnServer(
          'https://host.example/inkweld-a/api/v1/x/%2E..name%5Cpart',
          server
        )
      ).toBe(true);
    });

    it('lets a server at the root of its origin own every path on it', () => {
      expect(
        isUrlOnServer(
          'https://api.example.com/api/..%2F..%2Fother',
          'https://api.example.com'
        )
      ).toBe(true);
    });

    it('resolves relative URLs against the base URL', () => {
      expect(isUrlOnServer('/api/v1/x', 'https://app.example.com', base)).toBe(
        true
      );
      expect(
        isUrlOnServer('assets/x.json', 'https://app.example.com', base)
      ).toBe(true);
      expect(isUrlOnServer('/api/v1/x', 'https://api.example.com', base)).toBe(
        false
      );
    });

    it('resolves relative URLs inside an ingress-style prefix', () => {
      const ingressBase = 'https://ha.local:8123/api/hassio_ingress/abc/';
      const server = 'https://ha.local:8123/api/hassio_ingress/abc';
      expect(isUrlOnServer('api/v1/users/me', server, ingressBase)).toBe(true);
      // Root-absolute paths leave the prefix: that is the host's own API
      expect(isUrlOnServer('/api/v1/users/me', server, ingressBase)).toBe(
        false
      );
    });

    it('treats ws and wss like http and https', () => {
      expect(
        isUrlOnServer(
          'wss://example.com/inkweld/api/v1/ws/yjs?documentId=a:b:c',
          'https://example.com/inkweld'
        )
      ).toBe(true);
      expect(
        isUrlOnServer('ws://localhost:8333/api/v1/ws', 'http://localhost:8333')
      ).toBe(true);
      expect(isUrlOnServer('ws://example.com/api', 'https://example.com')).toBe(
        false
      );
    });

    it('rejects URLs that are not http(s) or ws(s)', () => {
      expect(isUrlOnServer('data:text/plain,x', 'https://example.com')).toBe(
        false
      );
      expect(
        isUrlOnServer('blob:https://example.com/x', 'https://example.com')
      ).toBe(false);
    });

    it('rejects what it cannot resolve', () => {
      expect(isUrlOnServer('/api/v1/x', 'https://example.com')).toBe(false);
      expect(isUrlOnServer('https://example.com/api', 'not a url')).toBe(false);
    });
  });
});
