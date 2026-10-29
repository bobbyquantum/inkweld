/**
 * `Content-Disposition` headers for file downloads.
 *
 * The quoted `filename="…"` parameter only carries printable ASCII safely, so
 * a name such as "Les Misérables.epub" is also sent as an RFC 6266
 * `filename*` (UTF-8, percent-encoded), which browsers prefer. The ASCII
 * `filename` stays as the fallback.
 */

/**
 * Make a filename safe for the quoted `filename="…"` parameter: drop quotes,
 * backslashes and line breaks (header injection) and replace anything else
 * outside printable ASCII with `_`.
 */
export function sanitizeFilename(filename: string): string {
  let result = '';
  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"' || ch === '\\' || ch === '\r' || ch === '\n') {
      // strip header-injection characters
    } else if (code < 0x20 || code > 0x7e) {
      result += '_';
    } else {
      result += ch;
    }
  }
  return result;
}

/** Percent-encode for `filename*`; RFC 5987 also reserves ' ( ) *. */
function encodeExtValue(value: string): string {
  return encodeURIComponent(value.toWellFormed()).replaceAll(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function contentDisposition(type: 'attachment' | 'inline', filename: string): string {
  const fallback = sanitizeFilename(filename);
  const header = `${type}; filename="${fallback}"`;
  if (fallback === filename) return header;
  return `${header}; filename*=UTF-8''${encodeExtValue(filename)}`;
}
