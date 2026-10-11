/**
 * The public landing page for a shared published file (`/share/:token`).
 *
 * Served by the API server itself rather than the Angular app: on a split
 * deployment the frontend origin (e.g. inkweld.app) talks to whichever server
 * the visitor picked, so it cannot tell which server a token belongs to. The
 * server that issued the token always can.
 *
 * The page is static HTML with no script; the download button is a plain link
 * to `GET /api/v1/share/:token`. Every value from the file record is escaped.
 */

import { createHash } from 'node:crypto';

export interface SharePageFile {
  filename: string;
  format: string;
  size: number;
  title: string;
  author: string;
  subtitle?: string | null;
  createdAt: number;
  sharePermission: string;
}

const FORMAT_LABELS: Record<string, string> = {
  EPUB: 'EPUB e-book',
  PDF_SIMPLE: 'PDF',
  MARKDOWN: 'Markdown',
  HTML: 'HTML',
  HTML_SITE: 'Website (ZIP)',
};

const STYLE = `
:root{color-scheme:light dark;--bg:#f4f1ea;--card:#fff;--text:#1f1d1a;--muted:#6b665d;--border:#e2ddd2;--accent:#5b3fa8;--on-accent:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#16151a;--card:#211f26;--text:#ece9f1;--muted:#a7a2b0;--border:#34313b;--accent:#b9a4f0;--on-accent:#1a1625}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{width:100%;max-width:480px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:32px}
h1{margin:0 0 4px;font-size:1.5rem;line-height:1.25;overflow-wrap:anywhere}
.subtitle{margin:0 0 4px;font-size:1.05rem;color:var(--muted);overflow-wrap:anywhere}
.author{margin:0;color:var(--muted)}
header{margin-bottom:20px}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:0 0 24px;font-size:.9rem}
dt{color:var(--muted)}
dd{margin:0;overflow-wrap:anywhere}
.download{display:inline-block;background:var(--accent);color:var(--on-accent);text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px}
.download:focus-visible{outline:3px solid var(--text);outline-offset:2px}
footer{margin-top:24px;font-size:.8rem;color:var(--muted)}
`;

/** CSP source for the inline stylesheet above (the page has no other inline content). */
const STYLE_HASH = `'sha256-${createHash('sha256').update(STYLE).digest('base64')}'`;

/**
 * Content-Security-Policy for the share page: its own stylesheet and nothing
 * else. No script, no subresources, no framing.
 */
export const SHARE_PAGE_CSP = [
  "default-src 'none'",
  `style-src ${STYLE_HASH}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Share tokens are nanoid(16); anything outside its alphabet can't match. */
const SHARE_TOKEN_PATTERN = /^[\w-]{1,64}$/;

export function isWellFormedShareToken(token: string): boolean {
  return SHARE_TOKEN_PATTERN.test(token);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Robots directive for a shared file, used for both the `X-Robots-Tag`
 * header and the page's robots meta tag.
 *
 * "Anyone with link" files stay unlisted, so a link that leaks into a crawled
 * page does not put the file in search results. "Anyone" files may be indexed.
 */
export function robotsTagFor(permission: string): string {
  return permission === 'public' ? 'all' : 'noindex, nofollow';
}

function document(head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
${head}
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

/**
 * Render the landing page for a shared file.
 *
 * @param token  The share token (already validated as well-formed).
 * @param appName  Name shown in the footer (APP_NAME).
 */
export function renderSharePage(file: SharePageFile, token: string, appName: string): string {
  const title = escapeHtml(file.title || file.filename);
  const author = escapeHtml(file.author);
  const subtitle = file.subtitle ? escapeHtml(file.subtitle) : '';
  const format = escapeHtml(formatLabel(file.format));
  const description = author ? `${format} by ${author}` : format;
  // Relative so the link also works when the server sits under a path prefix.
  const downloadHref = `../api/v1/share/${encodeURIComponent(token)}`;

  const head = `<title>${title}</title>
<meta name="robots" content="${robotsTagFor(file.sharePermission)}">
<meta name="description" content="${description}">
<meta property="og:type" content="book">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">`;

  const body = `<header>
<h1>${title}</h1>
${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
${author ? `<p class="author">by ${author}</p>` : ''}
</header>
<dl>
<dt>File</dt><dd>${escapeHtml(file.filename)}</dd>
<dt>Format</dt><dd>${format}</dd>
<dt>Size</dt><dd>${formatFileSize(file.size)}</dd>
<dt>Published</dt><dd><time datetime="${new Date(file.createdAt).toISOString()}">${formatDate(file.createdAt)}</time></dd>
</dl>
<a class="download" href="${downloadHref}" data-testid="share-download">Download</a>
<footer>Shared with ${escapeHtml(appName)}</footer>`;

  return document(head, body);
}

/** Page for an unknown token, or a file whose owner stopped sharing it. */
export function renderShareNotFoundPage(appName: string): string {
  const head = `<title>Link unavailable</title>
<meta name="robots" content="noindex, nofollow">`;
  const body = `<header>
<h1>This link isn’t available</h1>
</header>
<p>The file may have been deleted, or its owner stopped sharing it.</p>
<footer>${escapeHtml(appName)}</footer>`;
  return document(head, body);
}
