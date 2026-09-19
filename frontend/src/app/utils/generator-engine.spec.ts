import { type Generator, type GeneratorRule } from '@models/generator';
import { describe, expect, it } from 'vitest';

import {
  isGeneratorValid,
  MAX_EXPANSION_CHARS,
  MAX_OUTPUT_LENGTH,
  mulberry32,
  parseReferences,
  rollGenerator,
  validateGenerator,
} from './generator-engine';

function makeGenerator(
  template: string,
  rules: GeneratorRule[] = [],
  overrides: Partial<Generator> = {}
): Generator {
  return {
    id: 'gen-1',
    name: 'Test generator',
    icon: 'casino',
    description: '',
    category: 'names',
    template,
    rules,
    ...overrides,
  };
}

/** Rolls once with a fixed seed and returns just the text. */
function rollOnce(generator: Generator, seed = 42): string {
  return rollGenerator(generator, { seed })[0].text;
}

describe('generator-engine', () => {
  describe('mulberry32', () => {
    it('produces the same sequence for the same seed', () => {
      const a = mulberry32(1234);
      const b = mulberry32(1234);
      const sequenceA = [a(), a(), a()];
      const sequenceB = [b(), b(), b()];
      expect(sequenceA).toEqual(sequenceB);
    });

    it('produces different sequences for different seeds', () => {
      const a = mulberry32(1);
      const b = mulberry32(2);
      expect(a()).not.toBe(b());
    });

    it('stays within [0, 1)', () => {
      const random = mulberry32(99);
      for (let i = 0; i < 500; i++) {
        const value = random();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  describe('parseReferences', () => {
    it('finds references in order', () => {
      expect(parseReferences('#first# of #place#')).toEqual([
        { key: 'first', modifiers: [] },
        { key: 'place', modifiers: [] },
      ]);
    });

    it('parses chained modifiers', () => {
      expect(parseReferences('#noun.a.capitalize#')).toEqual([
        { key: 'noun', modifiers: ['a', 'capitalize'] },
      ]);
    });

    it('ignores text that is not a reference', () => {
      expect(parseReferences('no refs # here #')).toEqual([]);
      expect(parseReferences('#1bad#')).toEqual([]);
    });
  });

  describe('rollGenerator', () => {
    it('returns the template verbatim when it has no references', () => {
      expect(rollOnce(makeGenerator('Just a prompt.'))).toBe('Just a prompt.');
    });

    it('expands a reference to one of the rule entries', () => {
      const generator = makeGenerator('#first#', [
        { key: 'first', entries: [{ text: 'Aldric' }, { text: 'Brynn' }] },
      ]);
      expect(['Aldric', 'Brynn']).toContain(rollOnce(generator));
    });

    it('expands references recursively', () => {
      const generator = makeGenerator('#name#', [
        { key: 'name', entries: [{ text: '#first# of #place#' }] },
        { key: 'first', entries: [{ text: 'Aldric' }] },
        { key: 'place', entries: [{ text: 'Riverwyn' }] },
      ]);
      expect(rollOnce(generator)).toBe('Aldric of Riverwyn');
    });

    it('is deterministic for a given seed', () => {
      const generator = makeGenerator('#first# #last#', [
        {
          key: 'first',
          entries: [{ text: 'Aldric' }, { text: 'Brynn' }, { text: 'Cera' }],
        },
        {
          key: 'last',
          entries: [{ text: 'Stonehelm' }, { text: 'Ashford' }],
        },
      ]);
      expect(rollOnce(generator, 7)).toBe(rollOnce(generator, 7));
    });

    it('reproduces a single result from the seed it reports', () => {
      const generator = makeGenerator('#first#', [
        {
          key: 'first',
          entries: [{ text: 'Aldric' }, { text: 'Brynn' }, { text: 'Cera' }],
        },
      ]);
      const batch = rollGenerator(generator, { seed: 3, count: 5 });
      for (const result of batch) {
        expect(rollGenerator(generator, { seed: result.seed })[0].text).toBe(
          result.text
        );
      }
    });

    it('produces the requested number of results', () => {
      const generator = makeGenerator('#first#', [
        { key: 'first', entries: [{ text: 'Aldric' }, { text: 'Brynn' }] },
      ]);
      expect(rollGenerator(generator, { seed: 1, count: 6 })).toHaveLength(6);
    });

    it('honours entry weights', () => {
      const generator = makeGenerator('#first#', [
        {
          key: 'first',
          entries: [
            { text: 'Common', weight: 99 },
            { text: 'Rare', weight: 1 },
          ],
        },
      ]);
      const texts = rollGenerator(generator, { seed: 5, count: 200 }).map(
        result => result.text
      );
      const common = texts.filter(text => text === 'Common').length;
      expect(common).toBeGreaterThan(150);
    });

    it('treats missing and invalid weights as 1', () => {
      const generator = makeGenerator('#coin#', [
        {
          key: 'coin',
          entries: [
            { text: 'Heads' },
            { text: 'Tails', weight: Number.NaN },
            { text: 'Edge', weight: -5 },
          ],
        },
      ]);
      const texts = new Set(
        rollGenerator(generator, { seed: 11, count: 60 }).map(
          result => result.text
        )
      );
      expect(texts).toEqual(new Set(['Heads', 'Tails', 'Edge']));
    });

    it('skips entries that are blank', () => {
      const generator = makeGenerator('#first#', [
        { key: 'first', entries: [{ text: '  ' }, { text: 'Aldric' }] },
      ]);
      const texts = new Set(
        rollGenerator(generator, { seed: 2, count: 20 }).map(
          result => result.text
        )
      );
      expect(texts).toEqual(new Set(['Aldric']));
    });

    it('leaves unknown references as literal text', () => {
      expect(rollOnce(makeGenerator('#missing# name'))).toBe('#missing# name');
    });

    describe('modifiers', () => {
      const cases: [string, string, string][] = [
        ['capitalize', 'aldric', 'Aldric'],
        ['upper', 'aldric', 'ALDRIC'],
        ['lower', 'ALDRIC', 'aldric'],
        ['title', 'the grey tower', 'The Grey Tower'],
        ['s', 'tower', 'towers'],
        ['s', 'city', 'cities'],
        ['s', 'torch', 'torches'],
        ['a', 'tower', 'a tower'],
        ['a', 'inn', 'an inn'],
        ['trim', '  spaced   out  ', 'spaced out'],
      ];

      it.each(cases)('applies .%s to %j', (modifier, input, expected) => {
        const generator = makeGenerator(`#word.${modifier}#`, [
          { key: 'word', entries: [{ text: input }] },
        ]);
        expect(rollOnce(generator)).toBe(expected);
      });

      it('applies chained modifiers left to right', () => {
        const generator = makeGenerator('#word.a.capitalize#', [
          { key: 'word', entries: [{ text: 'inn' }] },
        ]);
        expect(rollOnce(generator)).toBe('An inn');
      });

      it('ignores unknown modifiers', () => {
        const generator = makeGenerator('#word.nope#', [
          { key: 'word', entries: [{ text: 'Aldric' }] },
        ]);
        expect(rollOnce(generator)).toBe('Aldric');
      });

      it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
        'does not treat the inherited member .%s as a modifier',
        modifier => {
          const generator = makeGenerator(`#word.${modifier}#`, [
            { key: 'word', entries: [{ text: 'Aldric' }] },
          ]);
          expect(rollOnce(generator)).toBe('Aldric');
          expect(
            validateGenerator(generator).map(issue => issue.code)
          ).toContain('unknown-modifier');
        }
      );

      it('applies the modifier to the fully expanded value', () => {
        const generator = makeGenerator('#name.upper#', [
          { key: 'name', entries: [{ text: '#first# #last#' }] },
          { key: 'first', entries: [{ text: 'aldric' }] },
          { key: 'last', entries: [{ text: 'stonehelm' }] },
        ]);
        expect(rollOnce(generator)).toBe('ALDRIC STONEHELM');
      });
    });

    describe('runaway protection', () => {
      it('terminates on direct self-reference', () => {
        const generator = makeGenerator('#loop#', [
          { key: 'loop', entries: [{ text: 'x#loop#' }] },
        ]);
        const text = rollOnce(generator);
        expect(text.length).toBeLessThanOrEqual(MAX_OUTPUT_LENGTH);
        expect(text).toContain('#loop#');
      });

      it('terminates on mutual recursion, leaving the deepest reference intact', () => {
        const generator = makeGenerator('#a#', [
          { key: 'a', entries: [{ text: '#b#' }] },
          { key: 'b', entries: [{ text: '#a#' }] },
        ]);
        expect(rollOnce(generator)).toMatch(/^#[ab]#$/);
      });

      it('caps the characters expansions may contribute', () => {
        // Clamping only the finished string is not enough. These 1000
        // expansions of a 600 KB entry would build a 600-million-character
        // string, past V8's maximum string length, and `replace` would throw
        // `RangeError: Invalid string length` — taking out the settings list,
        // which rolls a sample for every generator it renders. Generators
        // arrive from collaborators and imported archives, so that has to
        // stay impossible however the rules are written.
        const chunk = 'x'.repeat(600_000);
        const generator = makeGenerator('#wide#'.repeat(1000), [
          { key: 'wide', entries: [{ text: chunk }] },
        ]);

        const text = rollOnce(generator);

        expect(text.length).toBeLessThanOrEqual(MAX_OUTPUT_LENGTH);
      });

      it('still expands ordinary grammars well within the character budget', () => {
        const generator = makeGenerator('#a# #b# #c#', [
          { key: 'a', entries: [{ text: 'one' }] },
          { key: 'b', entries: [{ text: 'two' }] },
          { key: 'c', entries: [{ text: 'three' }] },
        ]);
        expect(rollOnce(generator)).toBe('one two three');
        expect(MAX_EXPANSION_CHARS).toBeGreaterThan(MAX_OUTPUT_LENGTH);
      });

      it('caps output length', () => {
        const generator = makeGenerator('#wide#', [
          {
            key: 'wide',
            entries: [{ text: '#chunk##chunk##chunk##chunk##wide#' }],
          },
          { key: 'chunk', entries: [{ text: '0123456789' }] },
        ]);
        expect(rollOnce(generator).length).toBe(MAX_OUTPUT_LENGTH);
      });
    });

    describe('unique and exclude', () => {
      const alphabet = makeGenerator('#letter#', [
        {
          key: 'letter',
          entries: [
            { text: 'A' },
            { text: 'B' },
            { text: 'C' },
            { text: 'D' },
            { text: 'E' },
          ],
        },
      ]);

      it('never repeats a result when unique is set', () => {
        const texts = rollGenerator(alphabet, {
          seed: 4,
          count: 5,
          unique: true,
        }).map(result => result.text);
        expect(new Set(texts).size).toBe(texts.length);
      });

      it('returns fewer results rather than looping when it runs dry', () => {
        const results = rollGenerator(alphabet, {
          seed: 4,
          count: 50,
          unique: true,
        });
        expect(results).toHaveLength(5);
      });

      it('rejects excluded results case-insensitively', () => {
        const texts = rollGenerator(alphabet, {
          seed: 8,
          count: 5,
          exclude: ['a', ' b '],
        }).map(result => result.text);
        expect(texts).not.toContain('A');
        expect(texts).not.toContain('B');
      });

      it('drops blank results while filtering', () => {
        const generator = makeGenerator('#maybe#', [
          { key: 'maybe', entries: [{ text: 'Aldric' }] },
        ]);
        const results = rollGenerator(generator, {
          seed: 1,
          count: 3,
          unique: true,
        });
        expect(results).toEqual([{ text: 'Aldric', seed: expect.any(Number) }]);
      });
    });
  });

  describe('malformed input', () => {
    // A generator can arrive from an imported archive or a collaborator's
    // raw write, neither of which is shape-checked. Rolling one must degrade,
    // never throw — a throw here would break every surface that rolls.
    const malformed: [string, unknown][] = [
      [
        'a numeric entry text',
        { rules: [{ key: 'a', entries: [{ text: 7 }] }] },
      ],
      ['a null entry', { rules: [{ key: 'a', entries: [null] }] }],
      ['entries missing', { rules: [{ key: 'a' }] }],
      ['entries not an array', { rules: [{ key: 'a', entries: 'nope' }] }],
      ['rules not an array', { rules: 'nope' }],
      ['rules missing', {}],
      ['a rule with no key', { rules: [{ entries: [{ text: 'x' }] }] }],
      ['a null rule', { rules: [null] }],
      ['a non-string template', { template: 42, rules: [] }],
    ];

    it.each(malformed)('rolls without throwing given %s', (_label, patch) => {
      const generator = {
        ...makeGenerator('#a#'),
        ...(patch as object),
      };
      expect(() =>
        rollGenerator(generator, { seed: 1, count: 3 })
      ).not.toThrow();
    });

    it.each(malformed)(
      'validates without throwing given %s',
      (_label, patch) => {
        const generator = {
          ...makeGenerator('#a#'),
          ...(patch as object),
        };
        expect(() => validateGenerator(generator)).not.toThrow();
      }
    );

    it('skips unusable entries rather than rolling them', () => {
      const generator = {
        ...makeGenerator('#a#'),
        rules: [
          {
            key: 'a',
            entries: [{ text: 7 }, null, { text: 'Aldric' }],
          },
        ],
      } as unknown as Generator;

      const texts = new Set(
        rollGenerator(generator, { seed: 1, count: 20 }).map(r => r.text)
      );
      expect(texts).toEqual(new Set(['Aldric']));
    });
  });

  describe('validateGenerator', () => {
    it('accepts a well-formed generator', () => {
      const generator = makeGenerator('#first# #last#', [
        { key: 'first', entries: [{ text: 'Aldric' }] },
        { key: 'last', entries: [{ text: 'Stonehelm' }] },
      ]);
      expect(validateGenerator(generator)).toEqual([]);
      expect(isGeneratorValid(generator)).toBe(true);
    });

    it('reports an empty template', () => {
      const issues = validateGenerator(makeGenerator('   '));
      expect(issues.map(issue => issue.code)).toContain('empty-template');
    });

    it('reports invalid rule keys', () => {
      const issues = validateGenerator(
        makeGenerator('#ok#', [
          { key: '1bad', entries: [{ text: 'x' }] },
          { key: 'ok', entries: [{ text: 'y' }] },
        ])
      );
      expect(issues).toContainEqual(
        expect.objectContaining({ code: 'invalid-key', ruleKey: '1bad' })
      );
    });

    it('reports duplicate rule keys', () => {
      const issues = validateGenerator(
        makeGenerator('#first#', [
          { key: 'first', entries: [{ text: 'Aldric' }] },
          { key: 'first', entries: [{ text: 'Brynn' }] },
        ])
      );
      expect(issues).toContainEqual(
        expect.objectContaining({ code: 'duplicate-key', ruleKey: 'first' })
      );
    });

    it('reports rules with nothing to choose from', () => {
      const issues = validateGenerator(
        makeGenerator('#first#', [
          { key: 'first', entries: [{ text: '' }, { text: '   ' }] },
        ])
      );
      expect(issues).toContainEqual(
        expect.objectContaining({ code: 'empty-rule', ruleKey: 'first' })
      );
    });

    it('reports unknown references from the template and from rules', () => {
      const issues = validateGenerator(
        makeGenerator('#first# #missing#', [
          { key: 'first', entries: [{ text: '#alsoMissing#' }] },
        ])
      );
      expect(issues).toContainEqual(
        expect.objectContaining({
          code: 'unknown-reference',
          name: 'missing',
          ruleKey: undefined,
        })
      );
      expect(issues).toContainEqual(
        expect.objectContaining({
          code: 'unknown-reference',
          name: 'alsoMissing',
          ruleKey: 'first',
        })
      );
    });

    it('reports unknown modifiers', () => {
      const issues = validateGenerator(
        makeGenerator('#first.shout#', [
          { key: 'first', entries: [{ text: 'Aldric' }] },
        ])
      );
      expect(issues).toContainEqual(
        expect.objectContaining({ code: 'unknown-modifier', name: 'shout' })
      );
    });

    it('reports rules that can never finish expanding', () => {
      const issues = validateGenerator(
        makeGenerator('#a#', [
          { key: 'a', entries: [{ text: '#b#' }] },
          { key: 'b', entries: [{ text: '#a#' }] },
        ])
      );
      expect(issues.filter(issue => issue.code === 'non-terminating')).toEqual([
        expect.objectContaining({ ruleKey: 'a' }),
        expect.objectContaining({ ruleKey: 'b' }),
      ]);
    });

    it('accepts self-reference when another entry terminates', () => {
      const issues = validateGenerator(
        makeGenerator('#list#', [
          {
            key: 'list',
            entries: [{ text: 'item, #list#' }, { text: 'item' }],
          },
        ])
      );
      expect(issues).toEqual([]);
    });

    it('does not flag a rule as non-terminating when it is already empty', () => {
      const issues = validateGenerator(
        makeGenerator('#first#', [{ key: 'first', entries: [] }])
      );
      expect(issues.map(issue => issue.code)).toEqual(['empty-rule']);
    });
  });
});
