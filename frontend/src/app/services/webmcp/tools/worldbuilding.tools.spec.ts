import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { type ElementTypeSchema, FieldType } from '@models/schema-types';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
  type ProjectStateFake,
} from '../../../../testing/webmcp-testing';
import { ProjectToolContext } from './project-context';
import type { WebMcpToolDefinition } from './tool';
import { worldbuildingTools } from './worldbuilding.tools';

const CHARACTER: ElementTypeSchema = {
  id: 'character',
  name: 'Character',
  icon: 'person',
  description: 'People in the story',
  version: 1,
  tabs: [
    {
      key: 'basics',
      label: 'Basics',
      fields: [
        { key: 'fullName', label: 'Full name', type: FieldType.TEXT },
        { key: 'age', label: 'Age', type: FieldType.NUMBER },
        { key: 'alive', label: 'Alive', type: FieldType.CHECKBOX },
        {
          key: 'traits',
          label: 'Traits',
          type: FieldType.MULTISELECT,
          options: ['brave', 'shy'],
        },
        {
          key: 'mother',
          label: 'Mother',
          type: FieldType.RELATIONSHIP,
          relationshipTypeId: 'rel-mother',
          targetSchemaId: 'character',
        },
        {
          key: 'allies',
          label: 'Allies',
          type: FieldType.RELATIONSHIP,
          relationshipTypeId: 'rel-allies',
          multiple: true,
        },
        {
          key: 'origin',
          label: 'Origin',
          type: FieldType.TEXT,
          isNested: true,
          nestedFields: [{ key: 'town', label: 'Town', type: FieldType.TEXT }],
        },
      ],
    },
  ],
};

describe('worldbuilding tools', () => {
  let state: ProjectStateFake;
  let tools: WebMcpToolDefinition[];
  let wb: {
    getSchemaById: ReturnType<typeof vi.fn>;
    getAllSchemas: ReturnType<typeof vi.fn>;
    getSchemaForElement: ReturnType<typeof vi.fn>;
    getWorldbuildingData: ReturnType<typeof vi.fn>;
    getIdentityData: ReturnType<typeof vi.fn>;
    saveWorldbuildingData: ReturnType<typeof vi.fn>;
    saveIdentityData: ReturnType<typeof vi.fn>;
  };
  type Rel = {
    id: string;
    sourceElementId: string;
    targetElementId: string;
    relationshipTypeId: string;
  };
  let relationships: Rel[];
  let rels: {
    getAllRelationships: () => Rel[];
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationships: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    state = createProjectStateFake([
      element('elena', 'Elena', ElementType.Worldbuilding, 0, {
        schemaId: 'character',
      }),
      element('ch1', 'Chapter One', ElementType.Item),
      element('ma', 'Ma Voss', ElementType.Worldbuilding, 0, {
        schemaId: 'character',
      }),
      element('dock', 'The Dock', ElementType.Worldbuilding, 0, {
        schemaId: 'location',
      }),
    ]);
    relationships = [];
    let nextId = 0;
    rels = {
      getAllRelationships: () => relationships,
      addRelationship: vi.fn((source: string, target: string, type: string) => {
        const rel = {
          id: `r${++nextId}`,
          sourceElementId: source,
          targetElementId: target,
          relationshipTypeId: type,
        };
        relationships = [...relationships, rel];
        return rel;
      }),
      removeRelationships: vi.fn((ids: readonly string[]) => {
        relationships = relationships.filter(r => !ids.includes(r.id));
        return ids.length;
      }),
    };
    wb = {
      getSchemaById: vi.fn((id: string) =>
        id === 'character' ? CHARACTER : null
      ),
      getAllSchemas: vi.fn(() => [CHARACTER]),
      getSchemaForElement: vi.fn().mockResolvedValue(CHARACTER),
      getWorldbuildingData: vi
        .fn()
        .mockResolvedValue({ fullName: 'Elena Voss', age: 31 }),
      getIdentityData: vi
        .fn()
        .mockResolvedValue({ description: 'A smuggler', image: 'media://x' }),
      saveWorldbuildingData: vi.fn().mockResolvedValue(undefined),
      saveIdentityData: vi.fn().mockResolvedValue(undefined),
    };
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: WorldbuildingService, useValue: wb },
        { provide: RelationshipService, useValue: rels },
      ],
    });
    tools = worldbuildingTools(injector, new ProjectToolContext(injector));
  });

  it('lists templates, and one with its fields', async () => {
    const all = await callTool(tools, 'list_schemas');
    expect(all.data.schemas).toEqual([
      {
        id: 'character',
        name: 'Character',
        icon: 'person',
        description: 'People in the story',
        fieldCount: 7,
      },
    ]);

    const one = await callTool(tools, 'list_schemas', {
      schemaId: 'character',
    });
    const fields = one.data.tabs[0].fields;
    expect(fields[3].options).toEqual(['brave', 'shy']);
    expect(fields[4]).toMatchObject({
      relationshipTypeId: 'rel-mother',
      multiple: false,
    });
    expect(fields[6].nestedFields[0].key).toBe('town');

    const missing = await callTool(tools, 'list_schemas', { schemaId: 'x' });
    expect(missing.error).toContain('No template');
  });

  it('reads an entry with its field values', async () => {
    const { data } = await callTool(tools, 'get_worldbuilding', {
      elementId: 'elena',
    });
    expect(data.description).toBe('A smuggler');
    expect(data.hasImage).toBe(true);
    expect(data.schema).toEqual({ id: 'character', name: 'Character' });
    expect(data.tabs[0].fields.slice(0, 3)).toEqual([
      {
        key: 'fullName',
        label: 'Full name',
        type: 'text',
        value: 'Elena Voss',
      },
      { key: 'age', label: 'Age', type: 'number', value: 31 },
      { key: 'alive', label: 'Alive', type: 'checkbox', value: null },
    ]);
  });

  it('only reads worldbuilding elements', async () => {
    const { error } = await callTool(tools, 'get_worldbuilding', {
      elementId: 'ch1',
    });
    expect(error).toContain('not a WORLDBUILDING element');
  });

  it('writes typed field values and the description', async () => {
    const { data } = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: {
        age: 32,
        alive: true,
        traits: ['brave'],
        origin: { town: 'Harrow' },
        fullName: null,
      },
      description: 'A retired smuggler',
    });
    expect(wb.saveWorldbuildingData).toHaveBeenCalledWith(
      'elena',
      {
        age: 32,
        alive: true,
        traits: ['brave'],
        origin: { town: 'Harrow' },
        fullName: null,
      },
      'alice',
      'novel'
    );
    expect(wb.saveIdentityData).toHaveBeenCalledWith(
      'elena',
      { description: 'A retired smuggler' },
      'alice',
      'novel'
    );
    expect(data.updated).toHaveLength(5);
  });

  it('routes a bare description key to the identity', async () => {
    await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: { description: 'From fields' },
    });
    expect(wb.saveWorldbuildingData).not.toHaveBeenCalled();
    expect(wb.saveIdentityData).toHaveBeenCalledWith(
      'elena',
      { description: 'From fields' },
      'alice',
      'novel'
    );
  });

  it('rejects unknown fields and wrong types', async () => {
    const unknown = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: { height: 170 },
    });
    expect(unknown.error).toContain('has no field "height"');

    for (const [key, value, message] of [
      ['age', 'old', 'a number'],
      ['alive', 'yes', 'true or false'],
      ['traits', 'brave', 'an array'],
      ['fullName', 5, 'a string'],
      ['origin', 'Harrow', 'an object'],
    ] as const) {
      const { error } = await callTool(tools, 'update_worldbuilding', {
        elementId: 'elena',
        fields: { [key]: value },
      });
      expect(error).toContain(message);
    }
    expect(wb.saveWorldbuildingData).not.toHaveBeenCalled();
  });

  it('links a relationship field through relationships, and unlinks ids left out', async () => {
    const linked = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: { allies: ['ma', 'dock'], mother: 'ma' },
    });
    expect(linked.error).toBeUndefined();
    expect(linked.data.linked).toEqual({
      allies: { added: ['ma', 'dock'], removed: [] },
      mother: { added: ['ma'], removed: [] },
    });
    expect(
      relationships.map(r => [r.targetElementId, r.relationshipTypeId])
    ).toEqual([
      ['ma', 'rel-allies'],
      ['dock', 'rel-allies'],
      ['ma', 'rel-mother'],
    ]);
    expect(relationships.every(r => r.sourceElementId === 'elena')).toBe(true);
    // Relationship values never go into the element's data map
    expect(wb.saveWorldbuildingData).not.toHaveBeenCalled();

    const read = await callTool(tools, 'get_worldbuilding', {
      elementId: 'elena',
    });
    const readFields = read.data.tabs[0].fields as {
      key: string;
      value: unknown;
    }[];
    const values = Object.fromEntries(readFields.map(f => [f.key, f.value]));
    expect(values['allies']).toEqual(['ma', 'dock']);
    expect(values['mother']).toEqual(['ma']);

    const unlinked = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: { allies: ['dock'], mother: null },
    });
    expect(unlinked.data.linked).toEqual({
      allies: { added: [], removed: ['ma'] },
      mother: { added: [], removed: ['ma'] },
    });
    expect(relationships.map(r => r.targetElementId)).toEqual(['dock']);
  });

  it('writes no links when the open project changed during the update', async () => {
    const project = state.project();
    // Switches the open project while the field data is saved
    wb.saveWorldbuildingData.mockImplementation(() => {
      if (project) state.project.set({ ...project, slug: 'other' });
    });
    const { error } = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
      fields: { age: 40, allies: ['ma'] },
    });
    expect(error).toContain('The open project changed');
    expect(rels.addRelationship).not.toHaveBeenCalled();
  });

  it('checks relationship field targets before writing anything', async () => {
    for (const [fields, message] of [
      [{ mother: 'dock' }, 'only links elements of template'],
      [{ mother: ['ma', 'elena'] }, 'links a single element'],
      [{ allies: ['ghost'] }, 'no element with id "ghost"'],
      [{ allies: ['ch1'] }, 'links worldbuilding elements'],
      [{ allies: [5] }, 'give an element id'],
      [{ allies: ['ma'], age: 'old' }, 'a number'],
    ] as const) {
      const { error } = await callTool(tools, 'update_worldbuilding', {
        elementId: 'elena',
        fields,
      });
      expect(error).toContain(message);
    }
    expect(rels.addRelationship).not.toHaveBeenCalled();
    expect(rels.removeRelationships).not.toHaveBeenCalled();
    expect(wb.saveWorldbuildingData).not.toHaveBeenCalled();
  });

  it('needs something to change', async () => {
    const { error } = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
    });
    expect(error).toContain('Give fields or a description');
  });
});
