/**
 * Backend XML utility re-exports.
 *
 * The canonical implementation now lives in `@inkweld/prosemirror/xml`
 * so that backend (Bun + Cloudflare Workers) and frontend (browser)
 * share a single byte-for-byte compatible parser/serializer pair.
 *
 * `sanitizeFilename` stays here because it's an HTTP header concern,
 * not part of the ProseMirror XML format.
 */

export {
  decodeXmlEntities,
  skipTopLevelWhitespace,
  xmlContentToText,
} from '@inkweld/prosemirror/xml';

/**
 * Sanitize a filename to prevent HTTP header injection.
 * Removes quotes, backslashes, carriage returns, and newlines;
 * replaces non-printable / non-ASCII characters with underscores.
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
