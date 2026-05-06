/**
 * XML entity encoding / decoding utilities used by the canonical
 * Inkweld ProseMirror XML format.
 *
 * The XML subset supported here mirrors what y-prosemirror produces and
 * what Inkweld's clients can round-trip without loss. It is intentionally
 * *not* a full XML parser/serializer.
 */

/**
 * @see https://www.w3.org/TR/xml/#charsets
 */
function isValidXmlCodePoint(cp: number): boolean {
  return (
    cp === 0x9 ||
    cp === 0xa ||
    cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

/**
 * Decode the standard XML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`,
 * `&apos;`) plus numeric character references back to their character
 * equivalents. Invalid code points are left untouched so we never produce
 * an XML string that cannot be safely re-encoded.
 *
 * `&amp;` is decoded LAST so that an input that originally encoded the
 * literal text `&lt;` (serialised as `&amp;lt;`) round-trips to `&lt;`
 * rather than being double-decoded into `<`.
 */
export function decodeXmlEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll(/&#(\d+);/g, (match, code: string) => {
      const cp = Number.parseInt(code, 10);
      return Number.isInteger(cp) && isValidXmlCodePoint(cp) ? String.fromCodePoint(cp) : match;
    })
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (match, code: string) => {
      const cp = Number.parseInt(code, 16);
      return Number.isInteger(cp) && isValidXmlCodePoint(cp) ? String.fromCodePoint(cp) : match;
    })
    .replaceAll('&amp;', '&');
}

/**
 * Escape special characters in XML text content.
 */
export function escapeXmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Escape special characters in an XML attribute value. Attribute values
 * are always emitted with double quotes so we only need to escape the
 * characters that would terminate or alter the value.
 */
export function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

/**
 * Skip whitespace between top-level block elements during XML parsing.
 *
 * y-prosemirror crashes if free-floating Y.XmlText nodes appear at the
 * fragment level, so we treat newline-bearing whitespace runs between
 * top-level elements as insignificant and discard them.
 */
export function skipTopLevelWhitespace(xml: string, pos: number): number {
  if (!/\s/.test(xml[pos]) || xml[pos] === '<') {
    return pos;
  }

  const wsEnd = xml.indexOf('<', pos);
  const end = wsEnd === -1 ? xml.length : wsEnd;
  const ws = xml.substring(pos, end);
  return ws.trim() ? pos : end;
}
