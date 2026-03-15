/**
 * Pure utility functions for SPA asset serving.
 * Extracted from bun-app.ts for testability.
 */

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
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

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
  const normalizedPath = pathname.replace(/\/+/g, '/');
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
): { file: T; foundByBasename: boolean } | undefined {
  const file = embeddedFiles.get(relativePath);
  if (file) {
    return { file, foundByBasename: false };
  }

  // Try without leading paths
  const basename = relativePath.split('/').pop() || '';
  const basenameFile = embeddedFiles.get(basename);
  if (basenameFile) {
    return { file: basenameFile, foundByBasename: true };
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
