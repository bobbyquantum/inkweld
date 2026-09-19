import { describe, expect, it } from 'vitest';

import {
  cloneGenerator,
  createEmptyGenerator,
  DEFAULT_GENERATOR_ICON,
  formatEntryLines,
  type Generator,
  parseEntryLines,
  RULE_KEY_PATTERN,
} from './generator';

describe('generator model', () => {
  describe('createEmptyGenerator', () => {
    it('uses the supplied id and sensible defaults', () => {
      const generator = createEmptyGenerator('gen-1');
      expect(generator.id).toBe('gen-1');
      expect(generator.icon).toBe(DEFAULT_GENERATOR_ICON);
      expect(generator.template).toBe('');
      expect(generator.rules).toEqual([]);
    });

    it('stamps both timestamps', () => {
      const generator = createEmptyGenerator('gen-1');
      expect(generator.createdAt).toBe(generator.updatedAt);
      expect(Number.isNaN(Date.parse(generator.createdAt!))).toBe(false);
    });
  });

  describe('cloneGenerator', () => {
    const source: Generator = {
      id: 'gen-1',
      name: 'Names',
      icon: 'casino',
      description: 'Character names',
      category: 'names',
      template: '#first#',
      rules: [{ key: 'first', entries: [{ text: 'Aldric', weight: 2 }] }],
    };

    it('copies every value', () => {
      expect(cloneGenerator(source)).toEqual(source);
    });

    it('does not share rule or entry objects with the source', () => {
      const clone = cloneGenerator(source);
      clone.rules[0].key = 'changed';
      clone.rules[0].entries[0].text = 'Brynn';
      expect(source.rules[0].key).toBe('first');
      expect(source.rules[0].entries[0].text).toBe('Aldric');
    });
  });

  describe('parseEntryLines', () => {
    it('reads one entry per line and drops blanks', () => {
      expect(parseEntryLines('Aldric\n\n  Brynn  \n')).toEqual([
        { text: 'Aldric' },
        { text: 'Brynn' },
      ]);
    });

    it('reads a trailing weight', () => {
      expect(parseEntryLines('Aldric | 3')).toEqual([
        { text: 'Aldric', weight: 3 },
      ]);
      expect(parseEntryLines('Aldric | 2.5')).toEqual([
        { text: 'Aldric', weight: 2.5 },
      ]);
    });

    it('drops a weight of 1, which is already the default', () => {
      expect(parseEntryLines('Aldric | 1')).toEqual([{ text: 'Aldric' }]);
    });

    it('splits on the last separator', () => {
      expect(parseEntryLines('a | b | 3')).toEqual([
        { text: 'a | b', weight: 3 },
      ]);
    });

    it.each([
      ['a | b', 'the tail is not a number'],
      ['| 3', 'there is no text before the separator'],
      ['Aldric | -2', 'the weight is negative'],
      ['Aldric | 3 ish', 'the tail is not only a number'],
    ])('keeps %j as literal text when %s', line => {
      expect(parseEntryLines(line)).toEqual([{ text: line.trim() }]);
    });

    it('parses a very long line in linear time', () => {
      // The original regex retried every split point on a line with no
      // separator: 64,000 characters took ~2.5s, on every keystroke.
      const line = `a${' '.repeat(200_000)}`;
      const before = performance.now();
      const entries = parseEntryLines(line);
      const elapsed = performance.now() - before;

      expect(entries).toEqual([{ text: 'a' }]);
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('formatEntryLines', () => {
    it('round-trips through parseEntryLines', () => {
      const text = 'Aldric | 3\nBrynn\nCera | 2.5';
      expect(formatEntryLines(parseEntryLines(text))).toBe(text);
    });

    it('leaves a weight of 1 off', () => {
      expect(formatEntryLines([{ text: 'Aldric', weight: 1 }])).toBe('Aldric');
    });
  });

  describe('RULE_KEY_PATTERN', () => {
    it.each(['first', 'firstName', 'a1', 'with_underscore'])(
      'accepts %j',
      key => {
        expect(RULE_KEY_PATTERN.test(key)).toBe(true);
      }
    );

    it.each(['', '1st', 'has space', 'has.dot', 'has#hash'])(
      'rejects %j',
      key => {
        expect(RULE_KEY_PATTERN.test(key)).toBe(false);
      }
    );
  });
});
