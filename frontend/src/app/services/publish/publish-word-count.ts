/**
 * Word counting for generated publish output.
 *
 * One definition is shared by every generator and mirrors `countWords` in
 * `publish-plan-stats.service.ts`: whitespace-separated words of the text a
 * reader sees. Markup, the `<head>` (stylesheet, `<title>`, meta), scripts,
 * comments and the markup of inline SVG are not words.
 */

/** Elements whose contents are not text a reader sees. */
const NON_VISIBLE_TAGS = ['head', 'style', 'script', 'title', 'svg'];

/**
 * Remove comments and the non-visible elements above, with their contents.
 * Uses indexOf scanning rather than a lazy regex so unclosed or adversarial
 * markup stays linear-time. An element that is never closed runs to the end.
 */
function stripNonVisible(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let pos = 0;
  while (pos < html.length) {
    const next = nextNonVisible(lower, pos);
    if (!next) break;
    out += html.slice(pos, next.start) + ' ';
    const close = lower.indexOf(next.closer, next.start + next.opener.length);
    if (close === -1) return out;
    const gt = lower.indexOf('>', close);
    pos = gt === -1 ? html.length : gt + 1;
  }
  return out + html.slice(pos);
}

/** The earliest comment or non-visible element opening at or after `from`. */
function nextNonVisible(
  lower: string,
  from: number
): { start: number; opener: string; closer: string } | null {
  let best: { start: number; opener: string; closer: string } | null = null;
  const comment = lower.indexOf('<!--', from);
  if (comment !== -1) {
    best = { start: comment, opener: '<!--', closer: '-->' };
  }
  for (const tag of NON_VISIBLE_TAGS) {
    const opener = `<${tag}`;
    let start = lower.indexOf(opener, from);
    // Skip longer tag names that merely start the same way (<headline>).
    while (
      start !== -1 &&
      /[a-z0-9-]/.test(lower[start + opener.length] ?? '')
    ) {
      start = lower.indexOf(opener, start + opener.length);
    }
    if (start !== -1 && (!best || start < best.start)) {
      best = { start, opener, closer: `</${tag}` };
    }
  }
  return best;
}

/** Count whitespace-separated words in an HTML (or XHTML) string. */
export function countHtmlWords(html: string): number {
  const text = stripNonVisible(html).replaceAll(/<[^>]*>/g, ' ');
  return countTextWords(text);
}

/** Count whitespace-separated words in plain text. */
export function countTextWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
