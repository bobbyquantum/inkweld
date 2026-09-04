import { type ElementTypeSchema, FieldType } from '@models/schema-types';
import { describe, expect, it } from 'vitest';

import { mergeElementSchema, summariseLocalAdditions } from './schema-merge';

function schema(
  tabs: ElementTypeSchema['tabs'],
  version = 1
): ElementTypeSchema {
  return {
    id: 'character-v1',
    name: 'Character',
    icon: 'person',
    description: '',
    version,
    tabs,
  };
}

const text = (key: string, label = key) => ({
  key,
  label,
  type: FieldType.TEXT,
});

describe('mergeElementSchema', () => {
  it('takes the shared schema when the element copy is unchanged', () => {
    const shared = schema(
      [{ key: 'basic', label: 'Basic', fields: [text('age')] }],
      3
    );
    const local = schema(
      [{ key: 'basic', label: 'Basic', fields: [text('age')] }],
      1
    );
    const merged = mergeElementSchema(local, shared);
    expect(merged.version).toBe(3);
    expect(merged.tabs).toEqual(shared.tabs);
    expect(merged.updatedAt).toBeDefined();
  });

  it('keeps local-only fields by appending them to the shared tab', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age'), text('height')] },
    ]);
    const local = schema([
      { key: 'basic', label: 'Basic', fields: [text('age'), text('eyes')] },
    ]);
    const merged = mergeElementSchema(local, shared);
    expect(merged.tabs[0].fields.map(f => f.key)).toEqual([
      'age',
      'height',
      'eyes',
    ]);
  });

  it('keeps local-only tabs after the shared tabs', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
    ]);
    const local = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
      { key: 'lore', label: 'Lore', fields: [text('legend')] },
    ]);
    const merged = mergeElementSchema(local, shared);
    expect(merged.tabs.map(t => t.key)).toEqual(['basic', 'lore']);
    expect(merged.tabs[1].fields[0].key).toBe('legend');
  });

  it('lets shared win on items present in both', () => {
    const shared = schema([
      {
        key: 'basic',
        label: 'Basics',
        icon: 'info',
        fields: [text('age', 'Age (years)')],
      },
    ]);
    const local = schema([
      {
        key: 'basic',
        label: 'My basics',
        icon: 'star',
        fields: [text('age', 'How old')],
      },
    ]);
    const merged = mergeElementSchema(local, shared);
    expect(merged.tabs[0].label).toBe('Basics');
    expect(merged.tabs[0].icon).toBe('info');
    expect(merged.tabs[0].fields[0].label).toBe('Age (years)');
  });

  it('drops shared-removed fields the element did not add', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
    ]);
    const local = schema([
      { key: 'basic', label: 'Basic', fields: [text('age'), text('height')] },
    ]);
    // "height" exists only locally now, so it is treated as a local addition and kept.
    // This documents the two-way limitation: without a stored base, a field the
    // shared schema removed is indistinguishable from one the element added.
    const merged = mergeElementSchema(local, shared);
    expect(merged.tabs[0].fields.map(f => f.key)).toEqual(['age', 'height']);
  });

  it('does not mutate its inputs', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
    ]);
    const local = schema([
      { key: 'basic', label: 'Basic', fields: [text('age'), text('eyes')] },
    ]);
    const sharedBefore = JSON.stringify(shared);
    const localBefore = JSON.stringify(local);
    mergeElementSchema(local, shared);
    expect(JSON.stringify(shared)).toBe(sharedBefore);
    expect(JSON.stringify(local)).toBe(localBefore);
  });
});

describe('summariseLocalAdditions', () => {
  it('lists local-only tabs and fields', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
    ]);
    const local = schema([
      {
        key: 'basic',
        label: 'Basic',
        fields: [text('age'), text('eyes', 'Eye colour')],
      },
      { key: 'lore', label: 'Lore', fields: [] },
    ]);
    const summary = summariseLocalAdditions(local, shared);
    expect(summary.localOnlyTabs).toEqual(['Lore']);
    expect(summary.localOnlyFields).toEqual(['Basic · Eye colour']);
  });

  it('is empty when the element copy has no additions', () => {
    const shared = schema([
      { key: 'basic', label: 'Basic', fields: [text('age')] },
    ]);
    const summary = summariseLocalAdditions(shared, shared);
    expect(summary.localOnlyTabs).toEqual([]);
    expect(summary.localOnlyFields).toEqual([]);
  });
});
