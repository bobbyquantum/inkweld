/** Decode standard XML entities back to their character equivalents. */
export function decodeXmlEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    );
}

/**
 * Strip HTML/XML tags from ProseMirror XML and decode entities, returning plain text.
 * Block-level closing tags become newlines; inline tags are removed entirely.
 */
export function xmlContentToText(xmlContent: string): string {
  return xmlContent
    .replaceAll(/<\/(?:paragraph|heading|blockquote|listItem)>/gi, '\n')
    .replaceAll(/<\/[^>]+>/g, '')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

/**
 * Sanitize a filename to prevent HTTP header injection.
 * Removes quotes, backslashes, carriage returns, and newlines;
 * replaces non-printable / non-ASCII characters with underscores.
 */
export function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/["\\\r\n]/g, '').replaceAll(/[^\x20-\x7E]/g, '_');
}
