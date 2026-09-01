import { describe, expect, it } from 'bun:test';

import { CUSTOM_BODY_MARKER, CUSTOM_HEAD_MARKER, injectCustomHtml } from './spa-utils';

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

  it('consumes both markers when no snippets are configured', () => {
    const source = makeDocument();
    const result = injectCustomHtml(source, '', '');

    expect(result).not.toContain(CUSTOM_HEAD_MARKER);
    expect(result).not.toContain(CUSTOM_BODY_MARKER);
    expect(result).toContain('<app-root></app-root>');
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
    expect(result).toContain('<head>\n    <title>Inkweld</title>\n    ');
  });
});
