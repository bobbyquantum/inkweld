/**
 * Shared mark tag mappings for publish services
 * Used by both EPUB and PDF generators to consistently format ProseMirror marks
 */
export const MARK_TAGS: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  strong: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  em: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strike: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
};

export const TYPST_MARK_TAGS: Record<string, [string, string]> = {
  bold: ['*', '*'],
  strong: ['*', '*'],
  italic: ['_', '_'],
  em: ['_', '_'],
  underline: ['#underline[', ']'],
  strike: ['#strike[', ']'],
  code: ['`', '`'],
};

export function applyMarks(
  text: string,
  marks: string[],
  tagMap: Record<string, [string, string]>
): string {
  let result = text;
  for (const mark of marks) {
    const wrap = tagMap[mark];
    if (wrap) result = `${wrap[0]}${result}${wrap[1]}`;
  }
  return result;
}
