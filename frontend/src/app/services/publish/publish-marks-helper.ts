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
