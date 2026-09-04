import { describe, expect, it } from 'bun:test';

import { djb2Hex, type SchemaLike, schemaContentHash, stableStringify } from './schema-hash';

const makeSchema = (overrides: Partial<SchemaLike> = {}): SchemaLike => ({
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
        { key: 'age', label: 'Age', type: 'number' },
        { key: 'role', label: 'Role', type: 'text' },
      ],
    },
  ],
  ...overrides,
});

describe('schema-hash', () => {
  it('djb2Hex returns 8 hex characters and is deterministic', () => {
    expect(djb2Hex('hello')).toMatch(/^[0-9a-f]{8}$/);
    expect(djb2Hex('abc')).toBe(djb2Hex('abc'));
    expect(djb2Hex('abc')).not.toBe(djb2Hex('abd'));
  });

  it('stableStringify sorts keys recursively, keeps array order, drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('ignores id, version and timestamps', () => {
    const a = schemaContentHash(makeSchema());
    const b = schemaContentHash(
      makeSchema({ id: 'other', version: 9, createdAt: 'x', updatedAt: 'y', isNew: false })
    );
    expect(a).toBe(b);
  });

  it('changes when the shape changes', () => {
    const base = makeSchema();
    const changed = makeSchema({
      tabs: [
        {
          key: 'basic',
          label: 'Basic info',
          fields: [{ key: 'age', label: 'Age', type: 'number' }],
        },
      ],
    });
    expect(schemaContentHash(changed)).not.toBe(schemaContentHash(base));
  });

  /**
   * Golden value shared with the frontend spec
   * (frontend/src/app/utils/schema-hash.spec.ts) so a divergence between the
   * two implementations is caught on either side.
   */
  it('matches the frontend golden hash for a fixed schema', () => {
    expect(schemaContentHash(makeSchema({ description: 'golden' }))).toBe('1226fc60');
  });
});
