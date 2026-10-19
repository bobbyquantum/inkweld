import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { type ElementTypeSchema, FieldType } from '@models/schema-types';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
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

  beforeEach(() => {
    state = createProjectStateFake([
      element('elena', 'Elena', ElementType.Worldbuilding, 0, {
        schemaId: 'character',
      }),
      element('ch1', 'Chapter One', ElementType.Item),
    ]);
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
        fieldCount: 6,
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
    expect(fields[5].nestedFields[0].key).toBe('town');

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

  it('rejects unknown fields, wrong types and relationship fields', async () => {
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
      ['mother', 'el-2', 'create_relationship'],
    ] as const) {
      const { error } = await callTool(tools, 'update_worldbuilding', {
        elementId: 'elena',
        fields: { [key]: value },
      });
      expect(error).toContain(message);
    }
    expect(wb.saveWorldbuildingData).not.toHaveBeenCalled();
  });

  it('needs something to change', async () => {
    const { error } = await callTool(tools, 'update_worldbuilding', {
      elementId: 'elena',
    });
    expect(error).toContain('Give fields or a description');
  });
});
