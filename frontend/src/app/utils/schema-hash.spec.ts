import { type ElementTypeSchema, FieldType } from '@models/schema-types';
import { describe, expect, it } from 'vitest';

import { djb2Hex, schemaContentHash, stableStringify } from './schema-hash';

function makeSchema(
  overrides: Partial<ElementTypeSchema> = {}
): ElementTypeSchema {
  return {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: 'A character',
    version: 1,
    tabs: [
      {
        key: 'basic',
        label: 'Basic info',
        fields: [
          { key: 'age', label: 'Age', type: FieldType.NUMBER },
          { key: 'role', label: 'Role', type: FieldType.TEXT },
        ],
      },
    ],
    ...overrides,
  };
}

describe('schema-hash utils', () => {
  describe('djb2Hex', () => {
    it('returns 8 hex characters', () => {
      expect(djb2Hex('hello')).toMatch(/^[0-9a-f]{8}$/);
    });

    it('is deterministic and input-sensitive', () => {
      expect(djb2Hex('abc')).toBe(djb2Hex('abc'));
      expect(djb2Hex('abc')).not.toBe(djb2Hex('abd'));
    });
  });

  describe('stableStringify', () => {
    it('sorts object keys recursively', () => {
      const a = stableStringify({ b: 1, a: { d: 2, c: 3 } });
      const b = stableStringify({ a: { c: 3, d: 2 }, b: 1 });
      expect(a).toBe(b);
      expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
    });

    it('preserves array order', () => {
      expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
    });

    it('drops undefined properties', () => {
      expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
    });
  });

  describe('schemaContentHash', () => {
    it('ignores version and timestamps', () => {
      const base = makeSchema();
      const bumped = makeSchema({
        version: 7,
        createdAt: '2024-01-01',
        updatedAt: '2025-01-01',
        isNew: false,
      });
      expect(schemaContentHash(bumped)).toBe(schemaContentHash(base));
    });

    it('ignores the id so a clone with the same shape hashes equal', () => {
      expect(schemaContentHash(makeSchema({ id: 'other' }))).toBe(
        schemaContentHash(makeSchema())
      );
    });

    it('changes when a field is added', () => {
      const withField = makeSchema();
      withField.tabs[0].fields.push({
        key: 'eyes',
        label: 'Eye colour',
        type: FieldType.TEXT,
      });
      expect(schemaContentHash(withField)).not.toBe(
        schemaContentHash(makeSchema())
      );
    });

    it('changes when a tab label changes', () => {
      const renamed = makeSchema();
      renamed.tabs[0].label = 'Essentials';
      expect(schemaContentHash(renamed)).not.toBe(
        schemaContentHash(makeSchema())
      );
    });

    /**
     * Golden value shared with the backend spec
     * (backend/src/utils/schema-hash.spec.ts) so a divergence between the two
     * implementations is caught on either side.
     */
    it('matches the backend golden hash for a fixed schema', () => {
      expect(
        schemaContentHash(makeSchema({ description: 'golden', id: 'x' }))
      ).toBe('1226fc60');
    });

    it('changes when field order changes', () => {
      const reordered = makeSchema();
      reordered.tabs[0].fields.reverse();
      expect(schemaContentHash(reordered)).not.toBe(
        schemaContentHash(makeSchema())
      );
    });
  });
});
