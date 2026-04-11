import { describe, expect, it } from 'vitest';

import { applyMarks, MARK_TAGS, TYPST_MARK_TAGS } from './publish-marks-helper';

describe('publish-marks-helper', () => {
  describe('MARK_TAGS', () => {
    it('should define HTML tag pairs for all standard marks', () => {
      expect(MARK_TAGS['bold']).toEqual(['<strong>', '</strong>']);
      expect(MARK_TAGS['italic']).toEqual(['<em>', '</em>']);
      expect(MARK_TAGS['underline']).toEqual(['<u>', '</u>']);
      expect(MARK_TAGS['strike']).toEqual(['<s>', '</s>']);
      expect(MARK_TAGS['code']).toEqual(['<code>', '</code>']);
    });

    it('should map strong as alias for bold', () => {
      expect(MARK_TAGS['strong']).toEqual(MARK_TAGS['bold']);
    });

    it('should map em as alias for italic', () => {
      expect(MARK_TAGS['em']).toEqual(MARK_TAGS['italic']);
    });
  });

  describe('TYPST_MARK_TAGS', () => {
    it('should define Typst tag pairs for standard marks', () => {
      expect(TYPST_MARK_TAGS['bold']).toEqual(['*', '*']);
      expect(TYPST_MARK_TAGS['italic']).toEqual(['_', '_']);
      expect(TYPST_MARK_TAGS['code']).toEqual(['`', '`']);
      expect(TYPST_MARK_TAGS['underline']).toEqual(['#underline[', ']']);
      expect(TYPST_MARK_TAGS['strike']).toEqual(['#strike[', ']']);
    });
  });

  describe('applyMarks', () => {
    it('should return text unchanged when marks array is empty', () => {
      expect(applyMarks('hello', [], MARK_TAGS)).toBe('hello');
    });

    it('should wrap text with a single HTML mark', () => {
      expect(applyMarks('hello', ['bold'], MARK_TAGS)).toBe(
        '<strong>hello</strong>'
      );
    });

    it('should wrap text with multiple HTML marks in order', () => {
      const result = applyMarks('hello', ['bold', 'italic'], MARK_TAGS);
      expect(result).toBe('<em><strong>hello</strong></em>');
    });

    it('should skip unknown mark types', () => {
      expect(applyMarks('hello', ['unknown'], MARK_TAGS)).toBe('hello');
    });

    it('should apply Typst marks correctly', () => {
      const result = applyMarks(
        'hello',
        ['bold', 'underline'],
        TYPST_MARK_TAGS
      );
      expect(result).toBe('#underline[*hello*]');
    });
  });
});
