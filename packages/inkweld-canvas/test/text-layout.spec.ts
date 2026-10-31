import { describe, expect, it } from 'vitest';

import {
  canvasTextFont,
  type CanvasTextLayoutInput,
  estimateTextSize,
  layoutCanvasText,
  type TextMeasurer,
} from '../src/text-layout';

/** Every character is 10 wide, which makes the expected breaks easy to see. */
const measure: TextMeasurer = (text) => ({
  width: Array.from(text).length * 10,
  ascent: 16,
  descent: 4,
});

const input: CanvasTextLayoutInput = {
  text: 'one two three',
  fontSize: 20,
  fontFamily: 'Lato',
  fontStyle: 'normal',
  width: 0,
};

const lines = (overrides: Partial<CanvasTextLayoutInput>): string[] =>
  layoutCanvasText({ ...input, ...overrides }, measure).lines.map(
    (line) => line.text,
  );

describe('layoutCanvasText', () => {
  it('keeps one line without a width, and is as wide as it', () => {
    const layout = layoutCanvasText(input, measure);
    expect(layout.lines).toEqual([{ text: 'one two three', width: 130 }]);
    expect(layout.width).toBe(130);
    expect(layout.height).toBe(20);
  });

  it('wraps at the last space that fits', () => {
    expect(lines({ width: 80 })).toEqual(['one two', 'three']);
  });

  it('keeps the fixed width, however short the lines', () => {
    expect(layoutCanvasText({ ...input, width: 80 }, measure).width).toBe(80);
  });

  it('does not wrap text that fits', () => {
    expect(lines({ width: 130 })).toEqual(['one two three']);
  });

  it('wraps after a dash', () => {
    expect(lines({ text: 'well-known', width: 60 })).toEqual([
      'well-',
      'known',
    ]);
  });

  it('breaks a word with nowhere to wrap', () => {
    expect(lines({ text: 'abcdefgh', width: 30 })).toEqual([
      'abc',
      'def',
      'gh',
    ]);
  });

  it('drops text when not even one character fits, as the canvas does', () => {
    expect(lines({ text: 'abc', width: 5 })).toEqual([]);
  });

  it('skips the whitespace at a break', () => {
    expect(lines({ text: 'ab    cd', width: 30 })).toEqual(['ab', 'cd']);
  });

  it('respects line breaks, including empty lines', () => {
    expect(lines({ text: 'a\n\nb' })).toEqual(['a', '', 'b']);
  });

  it('counts letter spacing towards the width', () => {
    expect(lines({ text: 'abcd', width: 50, letterSpacing: 10 })).toEqual([
      'ab',
      'cd',
    ]);
    const layout = layoutCanvasText(
      { ...input, text: 'abcd', letterSpacing: 2 },
      measure,
    );
    expect(layout.width).toBe(48);
  });

  it('wraps a long paragraph into many lines', () => {
    const text = Array.from({ length: 40 }, () => 'word').join(' ');
    const result = lines({ text, width: 100 });
    expect(result.every((line) => line.length * 10 <= 100)).toBe(true);
    expect(result.join(' ')).toBe(text);
  });

  it('counts a character outside the basic plane as one', () => {
    expect(layoutCanvasText({ ...input, text: '😀' }, measure).width).toBe(10);
  });

  it('places the first baseline as the canvas does', () => {
    const layout = layoutCanvasText(input, measure);
    // (ascent - descent) / 2 + lineHeight / 2
    expect(layout.firstBaseline).toBe(16);
    expect(layout.lineHeightPx).toBe(20);
  });

  it('applies line height to the spacing and the height', () => {
    const layout = layoutCanvasText(
      { ...input, width: 80, lineHeight: 1.5 },
      measure,
    );
    expect(layout.lineHeightPx).toBe(30);
    expect(layout.height).toBe(60);
    expect(layout.firstBaseline).toBe(21);
  });

  it('asks the measure for the right font', () => {
    const fonts: string[] = [];
    layoutCanvasText({ ...input, fontStyle: 'bold italic' }, (text, font) => {
      fonts.push(`${font.family} ${font.size} ${font.bold} ${font.italic}`);
      return measure(text, font);
    });
    expect(new Set(fonts)).toEqual(new Set(['Lato 20 true true']));
  });
});

describe('canvasTextFont', () => {
  it.each([
    ['normal', false, false],
    ['bold', true, false],
    ['italic', false, true],
    ['bold italic', true, true],
  ] as const)('reads %s', (fontStyle, bold, italic) => {
    expect(canvasTextFont({ fontSize: 9, fontFamily: 'A', fontStyle })).toEqual(
      { family: 'A', size: 9, bold, italic },
    );
  });
});

describe('estimateTextSize', () => {
  it('gives a rough size from the font size alone', () => {
    const font = { family: 'A', size: 20, bold: false, italic: false };
    expect(estimateTextSize('abcd', font)).toEqual({
      width: 40,
      ascent: 16,
      descent: 4,
    });
  });
});
