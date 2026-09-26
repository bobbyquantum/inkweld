import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

import {
  CUSTOM_BODY_MARKER,
  CUSTOM_HEAD_MARKER,
  injectCustomHtml,
  patchNgswIndexHash,
} from './spa-utils';

const makeDocument = () => `<!doctype html>
<html lang="en">
  <head>
    <title>Inkweld</title>
    ${CUSTOM_HEAD_MARKER}
  </head>
  <body>
    <app-root></app-root>
    ${CUSTOM_BODY_MARKER}
  </body>
</html>`;

describe('injectCustomHtml', () => {
  it('substitutes head and body markers with the configured snippets', () => {
    const result = injectCustomHtml(
      makeDocument(),
      '<meta name="verification" content="abc">',
      '<script src="https://analytics.example.com/x.js"></script>'
    );

    expect(result).toContain('<meta name="verification" content="abc">');
    expect(result).toContain('<script src="https://analytics.example.com/x.js"></script>');
    // Head snippet ends up inside <head>, body snippet at end of <body>
    const headEnd = result.indexOf('</head>');
    expect(result.indexOf('verification')).toBeLessThan(headEnd);
    expect(result.indexOf('analytics.example.com')).toBeGreaterThan(headEnd);
  });

  it('returns the document byte-for-byte when no snippets are configured', () => {
    // The service worker verifies index.html against its build-time hash, so
    // the default (no custom HTML) must not alter a single byte.
    const source = makeDocument();
    expect(injectCustomHtml(source, '', '')).toBe(source);
  });

  it('returns documents without markers unchanged', () => {
    const plain = '<html><head></head><body></body></html>';
    expect(injectCustomHtml(plain, '<b>head</b>', '<i>body</i>')).toBe(plain);
  });

  it('treats replace-pattern sequences in snippets as literal text', () => {
    // "$&" would otherwise be expanded to the matched marker by String.replace
    const hostile = "$& $' $` $$";
    const result = injectCustomHtml(makeDocument(), hostile, '');

    expect(result).toContain(hostile);
    expect(result).not.toContain(CUSTOM_HEAD_MARKER);
  });

  it('handles a body-only snippet', () => {
    const result = injectCustomHtml(makeDocument(), '', '<div id="widget"></div>');

    expect(result).not.toContain(CUSTOM_BODY_MARKER);
    expect(result).toContain('<div id="widget"></div>');
    expect(result).toContain(CUSTOM_HEAD_MARKER);
  });
});

describe('patchNgswIndexHash', () => {
  const sha1 = (text: string) => createHash('sha1').update(text, 'utf8').digest('hex');
  const makeManifest = (indexHash: string) =>
    JSON.stringify(
      {
        configVersion: 1,
        index: '/index.html',
        hashTable: { '/index.html': indexHash, '/main.js': 'abc123' },
      },
      null,
      2
    );

  it('leaves the manifest untouched when index.html is served as built', () => {
    const index = makeDocument();
    const manifest = makeManifest(sha1(index));
    expect(patchNgswIndexHash(manifest, index)).toBe(manifest);
  });

  it('rewrites the index.html hash to match the injected document', () => {
    const built = makeDocument();
    const served = injectCustomHtml(built, '<meta name="x" content="é">', '');
    const patched = JSON.parse(patchNgswIndexHash(makeManifest(sha1(built)), served)) as {
      hashTable: Record<string, string>;
    };

    expect(patched.hashTable['/index.html']).toBe(sha1(served));
    expect(patched.hashTable['/main.js']).toBe('abc123');
  });

  it('returns unparseable or index-less manifests unchanged', () => {
    expect(patchNgswIndexHash('not json', 'x')).toBe('not json');
    const noIndex = JSON.stringify({ hashTable: { '/main.js': 'abc' } });
    expect(patchNgswIndexHash(noIndex, 'x')).toBe(noIndex);
  });
});
