import { describe, expect, it } from 'vitest';

import {
  type FieldRelationshipRecord,
  isRelationshipField,
  type LinkableElement,
  linkedTargetIds,
  parseRelationshipFieldValue,
  planRelationshipFieldLinks,
  type RelationshipFieldDefinition,
  relationshipFieldLinkErrors,
  relationshipFieldsOfSchema,
} from '../src/relationship-field';

const partOf: RelationshipFieldDefinition = {
  key: 'partOf',
  label: 'Part of',
  type: 'relationship',
  multiple: true,
  targetSchemaId: 'asset',
  relationshipTypeId: 'fieldrel-part',
};

const elements: Record<string, LinkableElement> = {
  tyre: { id: 'tyre', name: 'Tyre', type: 'WORLDBUILDING', schemaId: 'asset' },
  buggy: { id: 'buggy', name: 'Buggy', type: 'WORLDBUILDING', schemaId: 'asset' },
  truck: { id: 'truck', name: 'Truck', type: 'WORLDBUILDING', schemaId: 'asset' },
  mara: { id: 'mara', name: 'Mara', type: 'WORLDBUILDING', schemaId: 'character' },
  chapter: { id: 'chapter', name: 'Chapter 1', type: 'ITEM' },
};
const find = (id: string) => elements[id];
const exists = (id: string) => id in elements;

function rel(id: string, target: string, type = 'fieldrel-part', source = 'tyre') {
  return { id, sourceElementId: source, targetElementId: target, relationshipTypeId: type };
}

describe('relationship fields', () => {
  describe('relationshipFieldsOfSchema', () => {
    it('finds relationship fields across tabs and skips malformed entries', () => {
      const schema = {
        tabs: [
          { fields: [{ key: 'name', type: 'text' }, partOf] },
          {},
          { fields: [null, { type: 'relationship' }, { key: 'madeWith', type: 'relationship' }] },
        ],
      };
      expect(relationshipFieldsOfSchema(schema).map(f => f.key)).toEqual(['partOf', 'madeWith']);
      expect(relationshipFieldsOfSchema(null)).toEqual([]);
      expect(isRelationshipField(partOf)).toBe(true);
      expect(isRelationshipField({ type: 'text' })).toBe(false);
    });
  });

  describe('parseRelationshipFieldValue', () => {
    it('takes an array, a single id or an empty value', () => {
      expect(parseRelationshipFieldValue(partOf, ['buggy', ' truck ', 'buggy', ''])).toEqual({
        ids: ['buggy', 'truck'],
      });
      expect(parseRelationshipFieldValue(partOf, 'buggy')).toEqual({ ids: ['buggy'] });
      expect(parseRelationshipFieldValue(partOf, '')).toEqual({ ids: [] });
      expect(parseRelationshipFieldValue(partOf, null)).toEqual({ ids: [] });
      expect(parseRelationshipFieldValue(partOf, [])).toEqual({ ids: [] });
    });

    it('rejects values that are not ids', () => {
      expect(parseRelationshipFieldValue(partOf, 3)).toHaveProperty('error');
      expect(parseRelationshipFieldValue(partOf, [{ id: 'buggy' }])).toHaveProperty('error');
    });
  });

  describe('relationshipFieldLinkErrors', () => {
    it('accepts existing elements of the target template', () => {
      expect(relationshipFieldLinkErrors(partOf, 'tyre', ['buggy', 'truck'], find)).toEqual([]);
    });

    it('rejects a wrong template, a non-worldbuilding element, a missing id and the element itself', () => {
      const errors = relationshipFieldLinkErrors(
        partOf,
        'tyre',
        ['mara', 'chapter', 'ghost', 'tyre'],
        find,
        id => (id === 'asset' ? 'Asset' : undefined)
      );
      expect(errors).toHaveLength(4);
      expect(errors[0]).toContain('template "Asset" (asset)');
      expect(errors[0]).toContain('"Mara" (mara) uses "character"');
      expect(errors[1]).toContain('is a ITEM');
      expect(errors[2]).toContain('no element with id "ghost"');
      expect(errors[3]).toContain('itself');
    });

    it('links any worldbuilding element when the field has no target template', () => {
      const anyTarget = { ...partOf, targetSchemaId: '' };
      expect(relationshipFieldLinkErrors(anyTarget, 'tyre', ['mara'], find)).toEqual([]);
    });

    it('allows at most one id when the field is not multiple', () => {
      const single = { ...partOf, multiple: false };
      expect(relationshipFieldLinkErrors(single, 'tyre', ['buggy'], find)).toEqual([]);
      expect(relationshipFieldLinkErrors(single, 'tyre', ['buggy', 'truck'], find)[0]).toContain(
        'single element'
      );
    });

    it('needs a relationship type', () => {
      const untyped = { ...partOf, relationshipTypeId: undefined };
      expect(relationshipFieldLinkErrors(untyped, 'tyre', [], find)[0]).toContain(
        'no relationship type'
      );
    });
  });

  describe('linkedTargetIds', () => {
    it("reads the field's links in order, once each, leaving out deleted targets", () => {
      const relationships: FieldRelationshipRecord[] = [
        rel('r1', 'truck'),
        rel('r2', 'buggy'),
        rel('r3', 'truck'),
        rel('r4', 'gone'),
        rel('r5', 'mara', 'knows'),
        rel('r6', 'buggy', 'fieldrel-part', 'truck'),
      ];
      expect(linkedTargetIds('tyre', 'fieldrel-part', relationships, exists)).toEqual([
        'truck',
        'buggy',
      ]);
      expect(linkedTargetIds('tyre', 'fieldrel-part', relationships)).toEqual([
        'truck',
        'buggy',
        'gone',
      ]);
    });
  });

  describe('planRelationshipFieldLinks', () => {
    const plan = (desiredIds: string[], relationships: FieldRelationshipRecord[]) =>
      planRelationshipFieldLinks({
        sourceElementId: 'tyre',
        relationshipTypeId: 'fieldrel-part',
        desiredIds,
        relationships,
        elementExists: exists,
      });

    it('adds links the field does not have yet', () => {
      expect(plan(['buggy', 'truck', 'buggy'], [rel('r1', 'buggy')])).toEqual({
        add: ['truck'],
        remove: [],
      });
    });

    it('removes links no longer wanted, dangling links and duplicates', () => {
      const relationships = [
        rel('r1', 'buggy'),
        rel('r2', 'truck'),
        rel('r3', 'gone'),
        rel('r4', 'buggy'),
        rel('r5', 'truck', 'knows'),
      ];
      const result = plan(['buggy'], relationships);
      expect(result.add).toEqual([]);
      expect(result.remove.map(r => r.id)).toEqual(['r2', 'r3', 'r4']);
    });

    it('skips ids of elements that do not exist', () => {
      expect(plan(['ghost'], [])).toEqual({ add: [], remove: [] });
    });
  });
});
