/**
 * Word counting for generated publish output.
 *
 * One definition is shared by every generator and mirrors `countWords` in
 * `publish-plan-stats.service.ts`: whitespace-separated words of the text a
 * reader sees. Markup, the `<head>` (stylesheet, `<title>`, meta), scripts,
 * comments and the markup of inline SVG are not words.
 */

const NON_VISIBLE_BLOCKS =
  /<(head|style|script|title|svg)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;

/** Count whitespace-separated words in an HTML (or XHTML) string. */
export function countHtmlWords(html: string): number {
  const text = html
    .replaceAll(NON_VISIBLE_BLOCKS, ' ')
    .replaceAll(/<[^>]*>/g, ' ');
  return countTextWords(text);
}

/** Count whitespace-separated words in plain text. */
export function countTextWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
