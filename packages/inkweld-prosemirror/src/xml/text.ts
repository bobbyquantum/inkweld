/**
 * Lossy XML → plain text extractor.
 *
 * Used for previews, search excerpts, and the deprecated `text` read
 * format on the MCP `get_document_content` tool. Block-level closing
 * tags become newlines; everything else is stripped. Not invertible.
 */

const BLOCK_CLOSING_TAGS = [
  '</paragraph>',
  '</heading>',
  '</blockquote>',
  '</listItem>',
  '</list_item>',
  '</codeBlock>',
  '</code_block>',
];

/**
 * Strip XML/HTML tags from a ProseMirror XML string and decode the most
 * common entities, returning a plain-text approximation suitable for
 * previews and search.
 *
 * Uses a single-pass character scan (not regex) to avoid ReDoS on
 * adversarial input.
 */
export function xmlContentToText(xmlContent: string): string {
  let withNewlines = xmlContent;
  for (const tag of BLOCK_CLOSING_TAGS) {
    withNewlines = withNewlines.replaceAll(tag, '\n');
  }

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

  // Decode named entities first, then `&amp;` last so that escaped
  // sequences like `&amp;lt;` round-trip to the literal `&lt;` rather
  // than being double-decoded into `<`.
  return stripped
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .trim();
}
