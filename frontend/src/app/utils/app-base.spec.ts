import {
  appBasePath,
  appOrigin,
  appUrl,
  isHomeAssistantIngress,
} from './app-base';

function docWithBase(href: string | null, ingress = false): Document {
  const doc = document.implementation.createHTMLDocument('test');
  if (href !== null) {
    const base = doc.createElement('base');
    base.setAttribute('href', href);
    doc.head.appendChild(base);
  }
  if (ingress) {
    const meta = doc.createElement('meta');
    meta.setAttribute('name', 'inkweld-ingress');
    meta.setAttribute('content', 'home-assistant');
    doc.head.appendChild(meta);
  }
  return doc;
}

describe('app-base', () => {
  const ingress = 'https://ha.local:8123/api/hassio_ingress/abc123/';

  describe('appBasePath', () => {
    it('is empty at the root', () => {
      expect(appBasePath(docWithBase('https://example.com/'))).toBe('');
    });

    it('is the prefix without a trailing slash', () => {
      expect(appBasePath(docWithBase(ingress))).toBe(
        '/api/hassio_ingress/abc123'
      );
    });

    it('is empty without a document', () => {
      expect(appBasePath(null)).toBe('');
    });

    it('ignores the page path when there is no base element', () => {
      const doc = docWithBase(null);
      expect(doc.querySelector('base')).toBeNull();
      expect(appBasePath(doc)).toBe('');
    });
  });

  describe('appUrl', () => {
    it('keeps root paths unchanged at the root', () => {
      const doc = docWithBase('https://example.com/');
      expect(appUrl('/', doc)).toBe('/');
      expect(appUrl('/setup', doc)).toBe('/setup');
    });

    it('prefixes paths behind ingress', () => {
      const doc = docWithBase(ingress);
      expect(appUrl('/', doc)).toBe('/api/hassio_ingress/abc123/');
      expect(appUrl('/alice/novel/settings', doc)).toBe(
        '/api/hassio_ingress/abc123/alice/novel/settings'
      );
      expect(appUrl('setup', doc)).toBe('/api/hassio_ingress/abc123/setup');
    });
  });

  describe('appOrigin', () => {
    it('is the origin at the root', () => {
      expect(appOrigin(docWithBase('https://example.com/'))).toBe(
        'https://example.com'
      );
    });

    it('includes the prefix behind ingress', () => {
      expect(appOrigin(docWithBase(ingress))).toBe(
        'https://ha.local:8123/api/hassio_ingress/abc123'
      );
    });

    it('is empty without a document', () => {
      expect(appOrigin(null)).toBe('');
    });
  });

  describe('isHomeAssistantIngress', () => {
    it('detects the server-injected meta tag', () => {
      expect(isHomeAssistantIngress(docWithBase(ingress, true))).toBe(true);
      expect(isHomeAssistantIngress(docWithBase(ingress))).toBe(false);
      expect(isHomeAssistantIngress(null)).toBe(false);
    });
  });
});
