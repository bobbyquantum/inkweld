import { Injector, signal } from '@angular/core';
import { ElementType } from '@inkweld/index';
import type { TagDefinition } from '@models/tag.model';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TagService } from '@services/tag/tag.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callTool,
  createProjectStateFake,
  element,
} from '../../../../testing/webmcp-testing';
import { ProjectToolContext } from './project-context';
import { tagTools } from './tag.tools';
import type { WebMcpToolDefinition } from './tool';

describe('tag tools', () => {
  let tools: WebMcpToolDefinition[];
  let definitions: ReturnType<typeof signal<TagDefinition[]>>;
  let assigned: { elementId: string; tagId: string }[];
  let service: Record<string, unknown>;

  beforeEach(() => {
    const state = createProjectStateFake([
      element('ch1', 'Chapter One', ElementType.Item),
    ]);
    definitions = signal<TagDefinition[]>([
      { id: 'draft', name: 'Draft', icon: 'edit', color: '#000' },
    ]);
    assigned = [{ elementId: 'ch1', tagId: 'draft' }];
    service = {
      allTags: definitions,
      getTagDefinition: (id: string) => definitions().find(t => t.id === id),
      getTagCount: (id: string) => assigned.filter(a => a.tagId === id).length,
      getElementsWithTag: (id: string) =>
        assigned.filter(a => a.tagId === id).map(a => a.elementId),
      getResolvedTagsForElement: (id: string) =>
        assigned
          .filter(a => a.elementId === id)
          .map(a => ({
            definition: definitions().find(t => t.id === a.tagId)!,
          })),
      createCustomTag: vi.fn((tag: Omit<TagDefinition, 'id'>) => {
        const created = { ...tag, id: 'new-tag' };
        definitions.update(list => [...list, created]);
        return created;
      }),
      addTag: vi.fn((elementId: string, tagId: string) =>
        assigned.push({ elementId, tagId })
      ),
      removeTag: vi.fn((elementId: string, tagId: string) => {
        assigned = assigned.filter(
          a => !(a.elementId === elementId && a.tagId === tagId)
        );
      }),
      deleteCustomTag: vi.fn(),
    };
    const injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        { provide: TagService, useValue: service },
      ],
    });
    tools = tagTools(injector, new ProjectToolContext(injector));
  });

  it('lists tags with counts, and the elements of one tag', async () => {
    const all = await callTool(tools, 'list_tags');
    expect(all.data.tags).toEqual([
      { id: 'draft', name: 'Draft', color: '#000', icon: 'edit', count: 1 },
    ]);

    const one = await callTool(tools, 'list_tags', { tagId: 'draft' });
    expect(one.data.elements).toEqual([{ id: 'ch1', name: 'Chapter One' }]);
  });

  it('creates a tag with the dialog defaults, once per name', async () => {
    const { data } = await callTool(tools, 'create_tag', { name: 'Review' });
    expect(data).toEqual({
      id: 'new-tag',
      name: 'Review',
      color: '#607D8B',
      icon: 'label',
    });

    const again = await callTool(tools, 'create_tag', { name: 'draft' });
    expect(again.data.alreadyExisted).toBe(true);
  });

  it('adds and removes tags on an element', async () => {
    await callTool(tools, 'create_tag', { name: 'Review' });
    const { data } = await callTool(tools, 'tag_element', {
      elementId: 'ch1',
      add: ['new-tag'],
      remove: ['draft'],
    });
    expect(data.tags).toEqual([{ id: 'new-tag', name: 'Review' }]);

    const unknown = await callTool(tools, 'tag_element', {
      elementId: 'ch1',
      add: ['missing'],
    });
    expect(unknown.error).toContain('No tag with id "missing"');
  });

  it('deletes a tag and reports where it was used', async () => {
    const { data } = await callTool(tools, 'delete_tag', { tagId: 'draft' });
    expect(service['deleteCustomTag']).toHaveBeenCalledWith('draft');
    expect(data).toEqual({ deleted: 'draft', removedFrom: 1 });
  });
});
