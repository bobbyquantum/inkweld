import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import {
  type ElementRelationship,
  RelationshipCategory,
  type RelationshipTypeDefinition,
} from '@models/element-ref.model';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
} from '../../../../testing/webmcp-testing';
import { ProjectToolContext } from './project-context';
import { relationshipTools } from './relationship.tools';
import type { WebMcpToolDefinition } from './tool';

const SIBLING: RelationshipTypeDefinition = {
  id: 'sibling',
  name: 'Sibling of',
  inverseLabel: 'Sibling of',
  showInverse: true,
  category: RelationshipCategory.Familial,
  isBuiltIn: true,
  sourceEndpoint: { allowedSchemas: ['character'] },
  targetEndpoint: { allowedSchemas: ['character'] },
};

const MENTIONS: RelationshipTypeDefinition = {
  ...SIBLING,
  id: 'mentions',
  name: 'Mentions',
  inverseLabel: 'Mentioned in',
  category: RelationshipCategory.Reference,
  sourceEndpoint: { allowedSchemas: ['ITEM'] },
  targetEndpoint: { allowedSchemas: [] },
};

describe('relationship tools', () => {
  let tools: WebMcpToolDefinition[];
  let stored: ElementRelationship[];
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const state = createProjectStateFake([
      element('elena', 'Elena', ElementType.Worldbuilding, 0, {
        schemaId: 'character',
      }),
      element('marcus', 'Marcus', ElementType.Worldbuilding, 0, {
        schemaId: 'character',
      }),
      element('harrow', 'Harrow', ElementType.Worldbuilding, 0, {
        schemaId: 'location',
      }),
      element('ch1', 'Chapter One', ElementType.Item),
    ]);
    stored = [
      {
        id: 'r1',
        sourceElementId: 'elena',
        targetElementId: 'marcus',
        relationshipTypeId: 'sibling',
        note: 'Twins',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const types = [SIBLING, MENTIONS];
    service = {
      getAllTypes: vi.fn(() => types),
      getTypeById: vi.fn((id: string) => types.find(t => t.id === id)),
      getAllRelationships: vi.fn(() => stored),
      getOutgoingRelationships: vi.fn((id: string) =>
        stored.filter(r => r.sourceElementId === id)
      ),
      getIncomingRelationships: vi.fn((id: string) =>
        stored.filter(r => r.targetElementId === id)
      ),
      findRelationshipsBetween: vi.fn((s: string, t: string) =>
        stored.filter(r => r.sourceElementId === s && r.targetElementId === t)
      ),
      findRelationship: vi.fn(
        (id: string) => stored.find(r => r.id === id) ?? null
      ),
      addRelationship: vi.fn(
        (s: string, t: string, type: string, options?: { note?: string }) => {
          const r = {
            id: `r${stored.length + 1}`,
            sourceElementId: s,
            targetElementId: t,
            relationshipTypeId: type,
            note: options?.note,
            createdAt: '',
            updatedAt: '',
          };
          stored.push(r);
          return r;
        }
      ),
      updateRelationship: vi.fn(
        (id: string, updates: Partial<ElementRelationship>) => {
          stored = stored.map(r => (r.id === id ? { ...r, ...updates } : r));
        }
      ),
      removeRelationship: vi.fn((id: string) => {
        const before = stored.length;
        stored = stored.filter(r => r.id !== id);
        return stored.length < before;
      }),
      addCustomType: vi.fn(type => ({
        ...type,
        id: 'custom-1',
        isBuiltIn: false,
      })),
    };
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: RelationshipService, useValue: service },
      ],
    });
    tools = relationshipTools(injector, new ProjectToolContext(injector));
  });

  it('lists types with their endpoint constraints', async () => {
    const { data } = await callTool(tools, 'list_relationship_types');
    expect(data.types[0]).toEqual({
      id: 'sibling',
      name: 'Sibling of',
      inverseLabel: 'Sibling of',
      category: 'familial',
      sourceSchemas: ['character'],
      targetSchemas: ['character'],
    });
    expect(data.types[1].targetSchemas).toBeUndefined();
  });

  it('lists relationships of an element and of the project', async () => {
    const one = await callTool(tools, 'list_relationships', {
      elementId: 'marcus',
    });
    expect(one.data.outgoing).toEqual([]);
    expect(one.data.incoming[0]).toEqual({
      id: 'r1',
      source: { id: 'elena', name: 'Elena' },
      type: { id: 'sibling', name: 'Sibling of' },
      target: { id: 'marcus', name: 'Marcus' },
      note: 'Twins',
    });

    const all = await callTool(tools, 'list_relationships', {
      typeId: 'mentions',
    });
    expect(all.data.relationships).toEqual([]);
  });

  it('creates a relationship that fits the type', async () => {
    const { data } = await callTool(tools, 'create_relationship', {
      sourceId: 'marcus',
      targetId: 'elena',
      typeId: 'sibling',
      note: 'Older',
    });
    expect(service['addRelationship']).toHaveBeenCalledWith(
      'marcus',
      'elena',
      'sibling',
      { note: 'Older' }
    );
    expect(data.source.name).toBe('Marcus');
  });

  it('matches non-worldbuilding endpoints by element type', async () => {
    const { error } = await callTool(tools, 'create_relationship', {
      sourceId: 'ch1',
      targetId: 'harrow',
      typeId: 'mentions',
    });
    expect(error).toBeUndefined();
  });

  it('reuses an identical relationship', async () => {
    const { data } = await callTool(tools, 'create_relationship', {
      sourceId: 'elena',
      targetId: 'marcus',
      typeId: 'sibling',
    });
    expect(data.alreadyExisted).toBe(true);
    expect(service['addRelationship']).not.toHaveBeenCalled();
  });

  it('enforces the type constraints', async () => {
    const wrongSource = await callTool(tools, 'create_relationship', {
      sourceId: 'harrow',
      targetId: 'elena',
      typeId: 'sibling',
    });
    expect(wrongSource.error).toContain('must start from: character');

    const wrongTarget = await callTool(tools, 'create_relationship', {
      sourceId: 'elena',
      targetId: 'harrow',
      typeId: 'sibling',
    });
    expect(wrongTarget.error).toContain('must point to: character');

    const self = await callTool(tools, 'create_relationship', {
      sourceId: 'elena',
      targetId: 'elena',
      typeId: 'sibling',
    });
    expect(self.error).toContain('itself');

    const noType = await callTool(tools, 'create_relationship', {
      sourceId: 'elena',
      targetId: 'marcus',
      typeId: 'enemy',
    });
    expect(noType.error).toContain('No relationship type "enemy"');
  });

  it('updates and deletes relationships', async () => {
    const updated = await callTool(tools, 'update_relationship', {
      relationshipId: 'r1',
      note: 'Estranged',
    });
    expect(updated.data.note).toBe('Estranged');

    const missing = await callTool(tools, 'update_relationship', {
      relationshipId: 'nope',
    });
    expect(missing.error).toContain('No relationship');

    await callTool(tools, 'delete_relationship', { relationshipId: 'r1' });
    expect(stored).toEqual([]);
    const again = await callTool(tools, 'delete_relationship', {
      relationshipId: 'r1',
    });
    expect(again.error).toContain('No relationship');
  });

  it('defines a new relationship type', async () => {
    const { data } = await callTool(tools, 'create_relationship_type', {
      name: 'Mentor of',
      inverseLabel: 'Student of',
      category: 'professional',
      targetSchemas: ['character'],
    });
    expect(service['addCustomType']).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mentor of',
        inverseLabel: 'Student of',
        showInverse: true,
        category: 'professional',
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: ['character'] },
      })
    );
    expect(data.id).toBe('custom-1');
  });
});
