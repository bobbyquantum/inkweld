import { describe, it, expect } from 'bun:test';
import { createHash } from 'node:crypto';

import {
  SHARE_PAGE_CSP,
  escapeHtml,
  formatFileSize,
  formatLabel,
  isWellFormedShareToken,
  renderShareNotFoundPage,
  renderSharePage,
  robotsTagFor,
  type SharePageFile,
} from './share-page';

const file: SharePageFile = {
  filename: 'my-novel.epub',
  format: 'EPUB',
  size: 2048,
  title: 'My Novel',
  author: 'Ada Writer',
  subtitle: 'A Story',
  createdAt: Date.UTC(2026, 9, 11),
  sharePermission: 'link',
};

describe('share page', () => {
  it('shows the file details and links to the download endpoint', () => {
    const html = renderSharePage(file, 'tok_123-abc', 'Inkweld');

    expect(html).toContain('<title>My Novel</title>');
    expect(html).toContain('<h1>My Novel</h1>');
    expect(html).toContain('<p class="subtitle">A Story</p>');
    expect(html).toContain('by Ada Writer');
    expect(html).toContain('my-novel.epub');
    expect(html).toContain('EPUB e-book');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('October 11, 2026');
    expect(html).toContain('href="../api/v1/share/tok_123-abc"');
    expect(html).toContain('Shared with Inkweld');
  });

  it('falls back to the filename when there is no title, and omits an empty byline', () => {
    const html = renderSharePage(
      { ...file, title: '', author: '', subtitle: null },
      'tok',
      'Inkweld'
    );

    expect(html).toContain('<h1>my-novel.epub</h1>');
    expect(html).not.toContain('class="author"');
    expect(html).not.toContain('class="subtitle"');
  });

  it('escapes every value taken from the file record', () => {
    const html = renderSharePage(
      {
        ...file,
        title: '<script>alert(1)</script>',
        author: '"><img src=x onerror=alert(1)>',
        filename: "it's & <b>.epub",
        format: '<x>',
      },
      'tok',
      '<App>'
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('it&#39;s &amp; &lt;b&gt;.epub');
    expect(html).toContain('Shared with &lt;App&gt;');
  });

  it('keeps "Anyone with link" files out of search engines but lets "Anyone" files be indexed', () => {
    expect(renderSharePage(file, 'tok', 'Inkweld')).toContain(
      '<meta name="robots" content="noindex, nofollow">'
    );
    expect(renderSharePage({ ...file, sharePermission: 'public' }, 'tok', 'Inkweld')).toContain(
      '<meta name="robots" content="all">'
    );
    expect(robotsTagFor('link')).toBe('noindex, nofollow');
    expect(robotsTagFor('public')).toBe('all');
    expect(robotsTagFor('private')).toBe('noindex, nofollow');
  });

  it('renders a not-found page that is never indexed', () => {
    const html = renderShareNotFoundPage('Inkweld');
    expect(html).toContain('This link isn’t available');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('allows only its own inline stylesheet in the CSP', () => {
    const html = renderSharePage(file, 'tok', 'Inkweld');
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    const hash = `'sha256-${createHash('sha256').update(style).digest('base64')}'`;

    expect(SHARE_PAGE_CSP).toContain(`style-src ${hash}`);
    expect(SHARE_PAGE_CSP).toContain("default-src 'none'");
    expect(SHARE_PAGE_CSP).not.toContain('script-src');
    expect(html).not.toContain('<script');
  });

  it('accepts only tokens from the nanoid alphabet', () => {
    expect(isWellFormedShareToken('V1StGXR8_Z5jdHi6')).toBe(true);
    expect(isWellFormedShareToken('')).toBe(false);
    expect(isWellFormedShareToken('a/b')).toBe(false);
    expect(isWellFormedShareToken('<script>')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(65))).toBe(false);
  });

  it('formats sizes and formats', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.00 MB');
    expect(formatLabel('PDF_SIMPLE')).toBe('PDF');
    expect(formatLabel('UNKNOWN')).toBe('UNKNOWN');
    expect(escapeHtml(`<"'&>`)).toBe('&lt;&quot;&#39;&amp;&gt;');
  });
});
