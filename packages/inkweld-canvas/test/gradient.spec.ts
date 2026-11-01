import { describe, expect, it } from 'vitest';

import {
  isGradientFill,
  linearGradientLine,
  parseCssGradient,
  svgEsc,
} from '../src/gradient';

describe('svgEsc', () => {
  it('should escape ampersands', () => {
    expect(svgEsc('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(svgEsc('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape double quotes', () => {
    expect(svgEsc('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(svgEsc("it's")).toBe('it&#39;s');
  });

  it('should escape multiple special characters at once', () => {
    expect(svgEsc('<a & "b" \'c\'>')).toBe(
      '&lt;a &amp; &quot;b&quot; &#39;c&#39;&gt;',
    );
  });

  it('should return plain strings unchanged', () => {
    expect(svgEsc('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(svgEsc('')).toBe('');
  });
});

describe('gradient fills', () => {
  it('detects gradient strings', () => {
    expect(isGradientFill('linear-gradient(90deg, #f00, #00f)')).toBe(true);
    expect(isGradientFill('radial-gradient(circle, #f00, #00f)')).toBe(true);
    expect(isGradientFill('#ff0000')).toBe(false);
    expect(isGradientFill(undefined)).toBe(false);
  });

  it('parses angle and positioned stops', () => {
    const parsed = parseCssGradient(
      'linear-gradient(45deg, #ff0000 0%, rgba(0, 0, 255, 0.5) 100%)',
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('linear');
    expect(parsed!.angle).toBe(45);
    expect(parsed!.stops).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: 'rgba(0, 0, 255, 0.5)' },
    ]);
  });

  it('distributes stops without explicit positions evenly', () => {
    const parsed = parseCssGradient('linear-gradient(#f00, #0f0, #00f)');
    expect(parsed!.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    // No angle prefix defaults to "to bottom".
    expect(parsed!.angle).toBe(180);
  });

  it('parses radial gradients and skips shape prefixes', () => {
    const parsed = parseCssGradient(
      'radial-gradient(circle at center, #fff 0%, #000 100%)',
    );
    expect(parsed!.type).toBe('radial');
    expect(parsed!.stops).toHaveLength(2);
  });

  it('rejects non-gradients and single-stop bodies', () => {
    expect(parseCssGradient('#fff')).toBeNull();
    expect(parseCssGradient('linear-gradient(#fff)')).toBeNull();
  });

  it('computes the gradient line across a box', () => {
    // 90deg = to the right: horizontal line through the center.
    const { start, end } = linearGradientLine(90, 100, 50, { x: 50, y: 25 });
    expect(start.x).toBeCloseTo(0);
    expect(start.y).toBeCloseTo(25);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(25);
  });
});
