import { TestBed } from '@angular/core/testing';
import { type ElementTypeSchema, FieldType } from '@models/schema-types';
import { RelationshipFieldService } from '@services/relationship/relationship-field.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SchemaEditService } from './schema-edit.service';

function makeSchema(): ElementTypeSchema {
  return {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: '',
    version: 1,
    tabs: [
      {
        key: 'basic',
        label: 'Basic',
        fields: [
          { key: 'age', label: 'Age', type: FieldType.NUMBER },
          { key: 'role', label: 'Role', type: FieldType.TEXT },
          {
            key: 'mentor',
            label: 'Mentor',
            type: 'relationship',
            relationshipTypeId: 'fieldrel-mentor',
          },
        ],
      },
      { key: 'lore', label: 'Lore', fields: [] },
    ],
  };
}

describe('SchemaEditService', () => {
  let service: SchemaEditService;
  let relationshipFieldService: {
    isRelationshipField: ReturnType<typeof vi.fn>;
    stampRelationshipTypeId: ReturnType<typeof vi.fn>;
    ensureTypeForField: ReturnType<typeof vi.fn>;
    removeTypeForField: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    relationshipFieldService = {
      isRelationshipField: vi.fn(
        (field: { type: string }) => field.type === 'relationship'
      ),
      stampRelationshipTypeId: vi.fn((field: Record<string, unknown>) => ({
        ...field,
        relationshipTypeId: field['relationshipTypeId'] ?? 'fieldrel-new',
      })),
      ensureTypeForField: vi.fn(),
      removeTypeForField: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        SchemaEditService,
        {
          provide: RelationshipFieldService,
          useValue: relationshipFieldService,
        },
      ],
    });
    service = TestBed.inject(SchemaEditService);
  });

  it('adds a tab with a unique label and does not mutate the input', () => {
    const schema = makeSchema();
    const result = service.applyEdit(schema, { type: 'add-tab' });
    expect(result.error).toBeNull();
    expect(result.schema.tabs).toHaveLength(3);
    expect(result.schema.tabs[2].label).toBe('New Tab');
    expect(schema.tabs).toHaveLength(2);
  });

  it('adds a field and reports its id', () => {
    const result = service.applyEdit(makeSchema(), {
      type: 'add-field',
      tabKey: 'lore',
    });
    expect(result.addedFieldId).toMatch(/^field_/);
    expect(result.schema.tabs[1].fields[0].id).toBe(result.addedFieldId);
  });

  it('moves a field within a tab and ignores out-of-range moves', () => {
    const moved = service.applyEdit(makeSchema(), {
      type: 'move-field',
      tabKey: 'basic',
      fieldKey: 'role',
      delta: -1,
    });
    expect(moved.schema.tabs[0].fields.map(f => f.key)).toEqual([
      'role',
      'age',
      'mentor',
    ]);
    const unchanged = service.applyEdit(makeSchema(), {
      type: 'move-field',
      tabKey: 'basic',
      fieldKey: 'age',
      delta: -1,
    });
    expect(unchanged.schema.tabs[0].fields.map(f => f.key)).toEqual([
      'age',
      'role',
      'mentor',
    ]);
  });

  it('updates a tab by key', () => {
    const result = service.applyEdit(makeSchema(), {
      type: 'update-tab',
      tabKey: 'lore',
      patch: { label: 'Legends', icon: 'menu_book' },
    });
    expect(result.schema.tabs[1]).toMatchObject({
      label: 'Legends',
      icon: 'menu_book',
    });
  });

  it('returns a validation error for a duplicate key but still applies the edit', () => {
    const result = service.applyEdit(makeSchema(), {
      type: 'update-field',
      tabKey: 'basic',
      fieldKey: 'role',
      patch: { key: 'age' },
    });
    expect(result.error).toBe('Field keys must be unique across the template.');
    expect(result.schema.tabs[0].fields[1].key).toBe('age');
    expect(relationshipFieldService.ensureTypeForField).not.toHaveBeenCalled();
  });

  it('flags a flat field colliding with a nested group', () => {
    const schema = makeSchema();
    schema.tabs[1].fields.push({
      key: 'stats.hp',
      label: 'HP',
      type: FieldType.NUMBER,
    });
    const result = service.applyEdit(schema, {
      type: 'update-field',
      tabKey: 'basic',
      fieldKey: 'role',
      patch: { key: 'stats' },
    });
    expect(result.error).toContain('conflicts with a nested field group');
  });

  describe('relationship bookkeeping', () => {
    it('stamps and ensures a type when a field becomes a relationship', () => {
      const result = service.applyEdit(makeSchema(), {
        type: 'update-field',
        tabKey: 'basic',
        fieldKey: 'role',
        patch: { type: 'relationship' },
      });
      expect(result.schema.tabs[0].fields[1].relationshipTypeId).toBe(
        'fieldrel-new'
      );
      expect(relationshipFieldService.ensureTypeForField).toHaveBeenCalledWith(
        'character-v1',
        expect.objectContaining({ key: 'role', type: 'relationship' })
      );
    });

    it('removes the type when a relationship field is deleted in template mode', () => {
      service.applyEdit(makeSchema(), {
        type: 'remove-field',
        tabKey: 'basic',
        fieldKey: 'mentor',
      });
      expect(relationshipFieldService.removeTypeForField).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'mentor' }),
        true
      );
    });

    it('never removes types in per-element mode', () => {
      const options = { removeRelationshipTypes: false };
      service.applyEdit(
        makeSchema(),
        { type: 'remove-field', tabKey: 'basic', fieldKey: 'mentor' },
        options
      );
      service.applyEdit(
        makeSchema(),
        { type: 'remove-tab', tabKey: 'basic' },
        options
      );
      service.applyEdit(
        makeSchema(),
        {
          type: 'update-field',
          tabKey: 'basic',
          fieldKey: 'mentor',
          patch: { type: 'text' },
        },
        options
      );
      expect(
        relationshipFieldService.removeTypeForField
      ).not.toHaveBeenCalled();
    });

    it('removes types for every relationship field in a deleted tab in template mode', () => {
      service.applyEdit(makeSchema(), { type: 'remove-tab', tabKey: 'basic' });
      expect(relationshipFieldService.removeTypeForField).toHaveBeenCalledTimes(
        1
      );
    });
  });
});
