import type { Injector } from '@angular/core';
import { TagService } from '@services/tag/tag.service';

import type { ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

/** Same defaults as the tag editor dialog. */
const DEFAULT_TAG_ICON = 'label';
const DEFAULT_TAG_COLOR = '#607D8B';

/** Project tags and which elements carry them. */
export function tagTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const tags = injector.get(TagService);

  function requireTag(tagId: string): void {
    if (!tags.getTagDefinition(tagId)) {
      throw new ToolError(`No tag with id "${tagId}". Call list_tags.`);
    }
  }

  return [
    {
      name: 'list_tags',
      title: 'List tags',
      description:
        'The tags defined in this project, with how many elements carry each. Pass tagId to also get those elements.',
      inputSchema: schema({ tagId: { type: 'string' } }),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        ctx.project();
        const tagId = args.optionalString('tagId');
        if (tagId) {
          requireTag(tagId);
          return {
            tag: tags.getTagDefinition(tagId),
            elements: tags.getElementsWithTag(tagId).map(id => {
              const element = ctx.elements().find(e => e.id === id);
              return { id, name: element?.name ?? '(deleted)' };
            }),
          };
        }
        return {
          tags: tags.allTags().map(t => ({
            id: t.id,
            name: t.name,
            color: t.color,
            icon: t.icon,
            ...(t.description ? { description: t.description } : {}),
            count: tags.getTagCount(t.id),
          })),
        };
      },
    },
    {
      name: 'create_tag',
      writes: true,
      title: 'Create tag',
      description: 'Define a new tag for this project.',
      inputSchema: schema(
        {
          name: { type: 'string' },
          color: { type: 'string', description: 'CSS colour, e.g. #E53935.' },
          icon: { type: 'string', description: 'Material icon name.' },
          description: { type: 'string' },
        },
        ['name']
      ),
      run: args => {
        ctx.requireWrite();
        const name = args.string('name').trim();
        const existing = tags
          .allTags()
          .find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) return { ...existing, alreadyExisted: true };
        const description = args.optionalString('description');
        return tags.createCustomTag({
          name,
          color: args.optionalString('color') ?? DEFAULT_TAG_COLOR,
          icon: args.optionalString('icon') ?? DEFAULT_TAG_ICON,
          ...(description ? { description } : {}),
        });
      },
    },
    {
      name: 'tag_element',
      writes: true,
      title: 'Tag or untag element',
      description: 'Add tags to an element and/or remove tags from it.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          add: { type: 'array', items: { type: 'string' } },
          remove: { type: 'array', items: { type: 'string' } },
        },
        ['elementId']
      ),
      run: args => {
        ctx.requireWrite();
        const element = ctx.element(args.string('elementId'));
        const add = args.stringArray('add');
        const remove = args.stringArray('remove');
        [...add, ...remove].forEach(requireTag);
        add.forEach(tagId => tags.addTag(element.id, tagId));
        remove.forEach(tagId => tags.removeTag(element.id, tagId));
        return {
          elementId: element.id,
          tags: tags
            .getResolvedTagsForElement(element.id)
            .map(t => ({ id: t.definition.id, name: t.definition.name })),
        };
      },
    },
    {
      name: 'delete_tag',
      writes: true,
      title: 'Delete tag',
      description: 'Delete a tag definition and remove it from every element.',
      inputSchema: schema({ tagId: { type: 'string' } }, ['tagId']),
      consequential: true,
      run: args => {
        ctx.requireWrite();
        const tagId = args.string('tagId');
        requireTag(tagId);
        const removedFrom = tags.getTagCount(tagId);
        tags.deleteCustomTag(tagId);
        return { deleted: tagId, removedFrom };
      },
    },
  ];
}
