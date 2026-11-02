/**
 * Lays out canvas text the way the canvas draws it, so an SVG or a server
 * render wraps and places lines where the app does. This follows
 * `_setTextData` and `_sceneFunc` in Konva's `Text`; keep them in step when
 * Konva is upgraded. Pure: the caller supplies the measuring, since only it
 * knows which fonts exist.
 */

import type { CanvasText } from './model';

/** The font a piece of text is drawn in. */
export interface CanvasFontSpec {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
}

/** The size of a run of text, in canvas units. */
export interface MeasuredText {
  width: number;
  /** The font's height above the baseline, positive. */
  ascent: number;
  /** The font's depth below the baseline, positive. */
  descent: number;
}

export type TextMeasurer = (text: string, font: CanvasFontSpec) => MeasuredText;

/** A rough measure for when no fonts are at hand. */
export const estimateTextSize: TextMeasurer = (text, font) => ({
  width: Array.from(text).length * font.size * 0.5,
  ascent: font.size * 0.8,
  descent: font.size * 0.2,
});

/** The parts of a text object that decide its layout. */
export type CanvasTextLayoutInput = Pick<
  CanvasText,
  | 'text'
  | 'fontSize'
  | 'fontFamily'
  | 'fontStyle'
  | 'width'
  | 'lineHeight'
  | 'letterSpacing'
>;

export function canvasTextFont(
  obj: Pick<CanvasText, 'fontSize' | 'fontFamily' | 'fontStyle'>,
): CanvasFontSpec {
  return {
    family: obj.fontFamily,
    size: obj.fontSize,
    bold: obj.fontStyle.includes('bold'),
    italic: obj.fontStyle.includes('italic'),
  };
}

export interface CanvasTextLine {
  text: string;
  width: number;
}

export interface CanvasTextLayout {
  lines: CanvasTextLine[];
  /** The box width: the fixed width, or the widest line without one. */
  width: number;
  height: number;
  lineHeightPx: number;
  /** Where the first line's baseline sits below the top of the box. */
  firstBaseline: number;
}

const isBreak = (char: string): boolean => char === ' ' || char === '-';

/** The end of the longest run from `start` that fits. `start` when none does. */
function longestFit(
  start: number,
  length: number,
  perLine: number,
  fits: (end: number) => boolean,
): number {
  // Grow from the estimate until it stops fitting, then search inside that
  // window, so every probe measures about one line rather than the whole text.
  let low = start;
  let high = Math.min(length, start + perLine);
  while (fits(high)) {
    low = high;
    if (high === length) return low;
    high = Math.min(length, high + (high - start));
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** Move a break back to the last space or dash in the line, if it has one. */
function wordBreak(graphemes: string[], start: number, end: number): number {
  if (isBreak(graphemes[end])) return end;
  for (let index = end - 1; index >= start; index--) {
    if (isBreak(graphemes[index])) return index + 1;
  }
  return end;
}

/** Break one paragraph into lines that fit `maxWidth`. */
function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  widthOf: (text: string) => number,
): string[] {
  const graphemes = Array.from(paragraph);
  const length = graphemes.length;
  const perLine = Math.max(
    1,
    Math.ceil((length * maxWidth) / widthOf(paragraph)),
  );
  const lines: string[] = [];

  let start = 0;
  while (start < length) {
    const lineStart = start;
    const slice = (end: number): string =>
      graphemes.slice(lineStart, end).join('');
    const fit = longestFit(
      lineStart,
      length,
      perLine,
      (end) => widthOf(slice(end)) <= maxWidth,
    );
    // Not even one character fits; the canvas drops the rest as well.
    if (fit === lineStart) break;
    if (fit === length) {
      lines.push(slice(length));
      break;
    }
    const end = wordBreak(graphemes, lineStart, fit);
    lines.push(slice(end).trimEnd());
    // The next line starts after the whitespace of the break.
    start = end;
    while (start < length && !graphemes[start].trim()) start++;
  }
  return lines;
}

export function layoutCanvasText(
  obj: CanvasTextLayoutInput,
  measure: TextMeasurer,
): CanvasTextLayout {
  const font = canvasTextFont(obj);
  const spacing = obj.letterSpacing ?? 0;
  const widthOf = (text: string): number =>
    measure(text, font).width + spacing * Array.from(text).length;

  const lines: CanvasTextLine[] = [];
  for (const paragraph of obj.text.split('\n')) {
    const fitted =
      obj.width > 0 && widthOf(paragraph) > obj.width
        ? wrapParagraph(paragraph, obj.width, widthOf)
        : [paragraph];
    for (const text of fitted) lines.push({ text, width: widthOf(text) });
  }

  const lineHeightPx = (obj.lineHeight ?? 1) * obj.fontSize;
  const { ascent, descent } = measure('M', font);
  return {
    lines,
    width: obj.width || lines.reduce((w, line) => Math.max(w, line.width), 0),
    height: lines.length * lineHeightPx,
    lineHeightPx,
    firstBaseline: (ascent - descent) / 2 + lineHeightPx / 2,
  };
}
