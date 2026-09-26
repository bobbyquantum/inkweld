/**
 * Pure utility functions for SPA asset serving.
 * Extracted from bun-app.ts for testability.
 */

import { createHash } from 'node:crypto';

/**
 * Placeholder markers placed in the built index.html. The SPA-serving layer
 * substitutes them with the admin-configured CUSTOM_HEAD_HTML /
 * CUSTOM_BODY_HTML values at request time (see injectCustomHtml).
 */
export const CUSTOM_HEAD_MARKER = '<!-- INKWELD_HEAD_EXTRA -->';
export const CUSTOM_BODY_MARKER = '<!-- INKWELD_BODY_EXTRA -->';

/**
 * Substitute the custom-HTML markers in an index.html document with
 * admin-provided snippets.
 *
 * - An empty snippet leaves its marker untouched. The markers are plain HTML
 *   comments, and keeping them means an instance with no custom HTML serves
 *   index.html byte-for-byte as built, so it still matches the hash the
 *   Angular service worker recorded in ngsw.json.
 * - Replacement uses function replacements so `$&`, `$'` etc. in the
 *   admin's HTML are treated as literal text, not replace() patterns.
 * - Documents without the markers (older builds) are returned unchanged.
 */
export function injectCustomHtml(html: string, headExtra: string, bodyExtra: string): string {
  let result = html;

  if (headExtra && result.includes(CUSTOM_HEAD_MARKER)) {
    result = result.replace(CUSTOM_HEAD_MARKER, () => headExtra);
  }

  if (bodyExtra && result.includes(CUSTOM_BODY_MARKER)) {
    result = result.replace(CUSTOM_BODY_MARKER, () => bodyExtra);
  }

  return result;
}

/**
 * Point the service worker manifest's index.html hash at the document the
 * server actually serves.
 *
 * The Angular service worker downloads every prefetched file and rejects the
 * whole app version if one doesn't match its SHA-1 in `ngsw.json`. Injecting
 * custom HTML changes index.html after the build, so without this new
 * installs never finish caching the app and existing ones never update.
 *
 * Returns the manifest text unchanged when the hash already matches (no
 * custom HTML), when the manifest has no entry for /index.html, or when it
 * cannot be parsed — so the default case keeps serving the built bytes.
 */
export function patchNgswIndexHash(ngswJson: string, servedIndexHtml: string): string {
  let manifest: { hashTable?: Record<string, string> };
  try {
    manifest = JSON.parse(ngswJson) as typeof manifest;
  } catch {
    return ngswJson;
  }

  const hashTable = manifest.hashTable;
  if (!hashTable || typeof hashTable['/index.html'] !== 'string') {
    return ngswJson;
  }

  const hash = createHash('sha1').update(servedIndexHtml, 'utf8').digest('hex');
  if (hashTable['/index.html'] === hash) {
    return ngswJson;
  }

  hashTable['/index.html'] = hash;
  return JSON.stringify(manifest, null, 2);
}

/**
 * Sanitize a URL pathname into a safe relative file path.
 * Returns 'index.html' for empty or root paths.
 */
export function sanitizeSpaPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return 'index.html';
  }

  const safeSegments = pathname
    .split('/')
    .map((segment) => {
      const trimmed = segment.trim();
      try {
        return decodeURIComponent(trimmed).trim();
      } catch {
        return trimmed;
      }
    })
    .filter(
      (segment) =>
        segment &&
        segment !== '.' &&
        segment !== '..' &&
        !segment.includes('/') &&
        !segment.includes('\\')
    );

  if (safeSegments.length === 0) {
    return 'index.html';
  }

  return safeSegments.join('/');
}

/**
 * Determine whether a pathname should bypass the SPA handler
 * (i.e. it matches one of the API prefixes).
 */
export function shouldBypassSpa(pathname: string, prefixes: string[]): boolean {
  // Normalize path by collapsing multiple slashes (e.g., "//api/v1/health" -> "/api/v1/health")
  const normalizedPath = pathname.replaceAll(/\/+/g, '/');
  return prefixes.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
}

/**
 * Look up a file in an embedded files map by exact path, then by basename fallback.
 * Returns the file entry or undefined.
 */
export function findEmbeddedFile<T>(
  embeddedFiles: Map<string, T>,
  relativePath: string
): { file: T; matchedPath: string; foundByBasename: boolean } | undefined {
  const file = embeddedFiles.get(relativePath);
  if (file !== undefined) {
    return { file, matchedPath: relativePath, foundByBasename: false };
  }

  // Try without leading paths
  const basename = relativePath.split('/').pop() || '';
  const basenameFile = embeddedFiles.get(basename);
  if (basenameFile !== undefined) {
    return { file: basenameFile, matchedPath: basename, foundByBasename: true };
  }
  return undefined;
}

/**
 * Guess a MIME type from a file path extension.
 */
export function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    webmanifest: 'application/manifest+json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    wasm: 'application/wasm',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Build response headers for an asset, including content-type, optional encoding,
 * and cache-control (no-cache for index.html, immutable for everything else).
 */
export function buildAssetHeaders(
  contentType: string,
  relativePath: string,
  encoding?: string
): Headers {
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  if (encoding) {
    headers.set('Content-Encoding', encoding);
  }
  headers.set(
    'Cache-Control',
    relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  );
  return headers;
}
