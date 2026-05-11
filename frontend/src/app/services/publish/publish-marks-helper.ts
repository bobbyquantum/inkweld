/**
 * Shared mark tag mappings for publish services.
 *
 * Used by HTML/EPUB (HTML output) and PDF (Typst output) generators to
 * consistently format ProseMirror marks. The new style pipeline emits CSS
 * classes for mark wrappers; these maps remain the source-of-truth for the
 * underlying inline tags so generators can wrap content semantically.
 */
export const MARK_TAGS: Record<string, [string, string]> = {
  bold: ['<strong class="ink-mark-bold">', '</strong>'],
  strong: ['<strong class="ink-mark-bold">', '</strong>'],
  italic: ['<em class="ink-mark-italic">', '</em>'],
  em: ['<em class="ink-mark-italic">', '</em>'],
  underline: ['<u class="ink-mark-underline">', '</u>'],
  strike: ['<s class="ink-mark-strike">', '</s>'],
  code: ['<code class="ink-mark-code">', '</code>'],
  subscript: ['<sub class="ink-mark-subscript">', '</sub>'],
  superscript: ['<sup class="ink-mark-superscript">', '</sup>'],
  // link is handled specially with attrs by callers; emit a plain anchor
  link: ['<a class="ink-mark-link">', '</a>'],
  // comment marks are not rendered in publish output
  comment: ['', ''],
};

export const TYPST_MARK_TAGS: Record<string, [string, string]> = {
  bold: ['*', '*'],
  strong: ['*', '*'],
  italic: ['_', '_'],
  em: ['_', '_'],
  underline: ['#underline[', ']'],
  strike: ['#strike[', ']'],
  code: ['`', '`'],
  subscript: ['#sub[', ']'],
  superscript: ['#super[', ']'],
  link: ['', ''], // link wrapping is handled by callers using #link()
  comment: ['', ''], // comments are stripped from PDF output
};

/**
 * Marks that should be stripped from output entirely (no wrapping).
 */
export const SKIPPED_MARKS = new Set(['comment']);

export function applyMarks(
  text: string,
  marks: string[],
  tagMap: Record<string, [string, string]>
): string {
  let result = text;
  for (const mark of marks) {
    if (SKIPPED_MARKS.has(mark)) continue;
    const wrap = tagMap[mark];
    if (wrap) result = `${wrap[0]}${result}${wrap[1]}`;
  }
  return result;
}

/**
 * Returns the canonical mark name for a raw ProseMirror mark name.
 * Handles common aliases (em→italic, strong→bold) so style lookups by
 * canonical key resolve correctly.
 */
export function canonicalMarkName(name: string): string {
  switch (name) {
    case 'em':
      return 'italic';
    case 'strong':
      return 'bold';
    case 'sub':
      return 'subscript';
    case 'sup':
      return 'superscript';
    default:
      return name;
  }
}
