/**
 * Check whether a code point is a valid XML 1.0 character.
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

/** Decode standard XML entities back to their character equivalents. */
export function decodeXmlEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
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
    });
}

/**
 * Strip HTML/XML tags from ProseMirror XML and decode entities, returning plain text.
 * Block-level closing tags become newlines; all other tags are removed.
 * Uses a simple character scan to avoid regex on user-controlled content.
 */
export function xmlContentToText(xmlContent: string): string {
  // Replace known block-level closing tags with newlines (literal strings, no regex)
  const withNewlines = xmlContent
    .replaceAll('</paragraph>', '\n')
    .replaceAll('</heading>', '\n')
    .replaceAll('</blockquote>', '\n')
    .replaceAll('</listItem>', '\n');

  // Strip remaining tags with a character scan — avoids regex ReDoS on [^>]+
  let stripped = '';
  let inTag = false;
  for (const ch of withNewlines) {
    if (ch === '<') {
      inTag = true;
    } else if (ch === '>') {
      inTag = false;
    } else if (!inTag) {
      stripped += ch;
    }
  }

  return stripped
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

/**
 * Skip whitespace between top-level block elements during XML parsing.
 * y-prosemirror crashes if XmlText nodes appear at fragment level.
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
