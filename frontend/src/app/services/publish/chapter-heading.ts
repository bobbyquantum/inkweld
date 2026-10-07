import {
  ChapterHeadingStyle,
  ChapterNumbering,
  type PublishOptions,
} from '../../models/publish-plan';

/** True when rendered document HTML already opens with a heading. */
export const LEADING_HEADING_RE = /^\s*<h[1-6][\s>]/i;

/**
 * The heading to inject above a document's body, or null for none. Number
 * styles apply to chapters only; other documents get their name.
 *
 * @param numeral the chapter's number already rendered in the plan's numeral
 *   format ("3", "III", "Three").
 */
export function chapterHeadingText(
  title: string,
  numeral: string,
  isChapter: boolean,
  style: ChapterHeadingStyle | undefined
): string | null {
  switch (style ?? ChapterHeadingStyle.None) {
    case ChapterHeadingStyle.None:
      return null;
    case ChapterHeadingStyle.Number:
      return isChapter ? numeral : title || null;
    case ChapterHeadingStyle.ChapterNumber:
      return isChapter ? `Chapter ${numeral}` : title || null;
    case ChapterHeadingStyle.ChapterNumberAndName:
      if (!isChapter) return title || null;
      return title ? `Chapter ${numeral}: ${title}` : `Chapter ${numeral}`;
    default:
      return title || null;
  }
}

/** Prepend an `<h1>` to document HTML unless it already opens with a heading. */
export function withChapterHeading(
  body: string,
  heading: string | null,
  escape: (text: string) => string
): string {
  if (!heading || LEADING_HEADING_RE.test(body)) return body;
  return `<h1 class="ink-chapter-title">${escape(heading)}</h1>\n${body}`;
}

/** True when Markdown already opens with an ATX heading. */
export const LEADING_MARKDOWN_HEADING_RE = /^\s*#{1,6}\s/;

/**
 * {@link chapterHeadingText} for a plan item: renders the chapter's number in
 * the plan's numeral format using the caller's converters.
 */
export function chapterHeadingFor(
  title: string,
  chapterNumber: number,
  isChapter: boolean,
  options: PublishOptions,
  toRoman: (n: number) => string,
  toWritten: (n: number) => string
): string | null {
  const n = chapterNumber + 1;
  let numeral = String(n);
  if (options.chapterNumbering === ChapterNumbering.Roman) {
    numeral = toRoman(n);
  } else if (options.chapterNumbering === ChapterNumbering.Written) {
    numeral = toWritten(n);
  }
  return chapterHeadingText(
    title,
    numeral,
    isChapter,
    options.chapterHeadingStyle
  );
}
