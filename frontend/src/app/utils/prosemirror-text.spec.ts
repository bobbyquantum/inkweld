import { describe, expect, it } from 'vitest';

import { extractTextSpans, flattenToPlainText } from './prosemirror-text';

describe('prosemirror-text utilities', () => {
  // Helper to build a simple ProseMirror paragraph node
  const paragraph = (...texts: string[]) => ({
    type: 'paragraph',
    content: texts.map(t => ({ type: 'text', text: t })),
  });

  const heading = (level: number, text: string) => ({
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  });

  const image = () => ({ type: 'image', attrs: { src: 'img.png' } });

  describe('flattenToPlainText', () => {
    it('returns an empty string for empty nodes', () => {
      expect(flattenToPlainText([])).toBe('');
    });

    it('extracts text from a single paragraph', () => {
      const result = flattenToPlainText([paragraph('Hello world')]);
      expect(result).toContain('Hello world');
    });

    it('extracts text from multiple paragraphs separated by a space', () => {
      const nodes = [paragraph('First'), paragraph('Second')];
      const result = flattenToPlainText(nodes);
      expect(result).toContain('First');
      expect(result).toContain('Second');
      // Should not run together without any separator
      expect(result).not.toBe('FirstSecond');
    });

    it('merges inline text within a paragraph', () => {
      const node = {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      };
      expect(flattenToPlainText([node])).toContain('Hello world');
    });

    it('extracts text from headings', () => {
      const result = flattenToPlainText([heading(1, 'My Title')]);
      expect(result).toContain('My Title');
    });

    it('skips image nodes', () => {
      const result = flattenToPlainText([image()]);
      expect(result.trim()).toBe('');
    });

    it('skips image nodes mixed with text', () => {
      const node = {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Before ' },
          image(),
          { type: 'text', text: 'After' },
        ],
      };
      const result = flattenToPlainText([node]);
      expect(result).toContain('Before ');
      expect(result).toContain('After');
    });

    it('handles nested block nodes', () => {
      const blockquote = {
        type: 'blockquote',
        content: [paragraph('Quoted text')],
      };
      const result = flattenToPlainText([blockquote]);
      expect(result).toContain('Quoted text');
    });

    it('handles list items', () => {
      const list = {
        type: 'bullet_list',
        content: [
          { type: 'list_item', content: [paragraph('Item one')] },
          { type: 'list_item', content: [paragraph('Item two')] },
        ],
      };
      const result = flattenToPlainText([list]);
      expect(result).toContain('Item one');
      expect(result).toContain('Item two');
    });

    it('handles text with marks (bold, italic)', () => {
      const node = {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'bold text',
            marks: [{ type: 'bold' }],
          },
        ],
      };
      expect(flattenToPlainText([node])).toContain('bold text');
    });
  });

  describe('extractTextSpans', () => {
    it('returns empty array for empty nodes', () => {
      expect(extractTextSpans([])).toEqual([]);
    });

    it('returns spans with correct text', () => {
      const spans = extractTextSpans([paragraph('Hello')]);
      expect(spans.some(s => s.text === 'Hello')).toBe(true);
    });

    it('assigns increasing offsets', () => {
      const spans = extractTextSpans([paragraph('Hello'), paragraph('World')]);
      expect(spans.length).toBeGreaterThanOrEqual(2);
      // Offsets should be strictly increasing
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].offset).toBeGreaterThan(spans[i - 1].offset);
      }
    });

    it('first span starts at offset 0', () => {
      const spans = extractTextSpans([paragraph('Hello')]);
      expect(spans[0].offset).toBe(0);
    });

    it('span offset matches position of text in flattened string', () => {
      const nodes = [paragraph('Hello'), paragraph('World')];
      const spans = extractTextSpans(nodes);
      const flat = flattenToPlainText(nodes);

      for (const span of spans) {
        expect(flat.slice(span.offset, span.offset + span.text.length)).toBe(
          span.text
        );
      }
    });
  });
});
