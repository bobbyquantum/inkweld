import { describe, expect, it } from 'vitest';

import {
  cloneGenerator,
  createEmptyGenerator,
  DEFAULT_GENERATOR_ICON,
  type Generator,
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
