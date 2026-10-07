import { describe, expect, it } from 'vitest';

import { countHtmlWords, countTextWords } from './publish-word-count';

describe('countHtmlWords', () => {
  it('counts only the text a reader sees', () => {
    const html = `<!DOCTYPE html><html><head><title>My Book Title</title>
      <style>body { font-family: serif; margin: 0 } .a { color: red }</style>
      <script>var x = 1;</script></head>
      <body><!-- hidden note --><h1>Chapter One</h1><p>one <em>two</em> three</p></body></html>`;
    expect(countHtmlWords(html)).toBe(5);
  });

  it('ignores inline SVG markup', () => {
    expect(
      countHtmlWords('<p>a b</p><svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')
    ).toBe(2);
  });

  it('is not affected by the stylesheet size', () => {
    const body = '<p>' + 'word '.repeat(10) + '</p>';
    const small = `<html><head><style>a{}</style></head><body>${body}</body></html>`;
    const large = `<html><head><style>${'a { color: red; } '.repeat(200)}</style></head><body>${body}</body></html>`;
    expect(countHtmlWords(small)).toBe(10);
    expect(countHtmlWords(large)).toBe(10);
  });
});

describe('countHtmlWords edge cases', () => {
  it('does not treat longer tag names as non-visible elements', () => {
    expect(countHtmlWords('<headline>big news</headline> <p>ok</p>')).toBe(3);
  });

  it('drops an element that is never closed through the end', () => {
    expect(countHtmlWords('<p>a b</p><style>c d e')).toBe(2);
  });

  it('keeps a stray < that has no closing >', () => {
    expect(countHtmlWords('<p>a</p> 1 < 2 b')).toBe(5);
  });

  it('handles many unclosed openers in linear time', () => {
    const start = Date.now();
    countHtmlWords('<!--'.repeat(20000) + 'x');
    countHtmlWords('<style>'.repeat(20000));
    countHtmlWords('<'.repeat(50000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('countTextWords', () => {
  it('splits on any whitespace', () => {
    expect(countTextWords('  a\tb\n\nc  ')).toBe(3);
    expect(countTextWords('')).toBe(0);
  });
});
