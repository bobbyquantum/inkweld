/**
 * MCP Tools: Tags
 *
 * List, create, edit and delete a project's tags, and put them on elements.
 * Tags are the ones the app shows (Tags tab, tag chips, search): definitions
 * in the elements doc's `customTags` array, assignments in `elementTags` (see
 * `tag-store.ts`).
 *
 * `tag_element` only takes tags that already exist in the project, so every
 * tag has the icon and colour it was created with: an agent makes new tags
 * with `create_tag` first.
 *
 * Runtime-aware through `openEditableDocument` (live doc on Bun, a copy sent
 * back as a Yjs update on Workers).
 */

import type * as Y from 'yjs';
import type { McpContext, McpToolResult } from '../mcp.types';
import { registerTool } from '../mcp.handler';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import {
  DESTRUCTIVE_TOOL,
  IDEMPOTENT_WRITE_TOOL,
  READ_ONLY_TOOL,
  WRITE_TOOL,
} from '../tool-annotations';
import { logger } from '../../services/logger.service';
import { activityService } from '../../services/activity.service';
import type { DatabaseInstance } from '../../types/context';
import { openEditableDocument } from '../../services/yjs-document-access';
import { parseProjectParam } from './search.tools';
import {
  TAG_COLORS,
  TAG_ICONS,
  TagToolError,
  type TagDefinition,
  addElementTags,
  assertNameFree,
  compactTags,
  deleteWhere,
  newTagId,
  normalizeColor,
  normalizeIcon,
  presentTag,
  readElementIds,
  readElementTags,
  readTagDefinitions,
  removeElementTags,
  resolveTag,
  resolveTags,
  tagsForElement,
} from './tag-store';

const mcpTagLog = logger.child('MCP-Tags');

const projectProperty = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use list_projects to discover projects.',
} as const;

const ICON_LIST = TAG_ICONS.join(', ');
const COLOR_LIST = TAG_COLORS.map((c) => `${c.hex} (${c.name})`).join(', ');

const iconProperty = {
  type: 'string',
  enum: [...TAG_ICONS],
  description:
    'Material icon shown on the tag. Pick one that suits its meaning, e.g. person for characters, ' +
    'flag or priority_high for things to follow up, edit_note or construction for drafts, ' +
    `check_circle for finished work. Allowed: ${ICON_LIST}.`,
} as const;

const colorProperty = {
  type: 'string',
  enum: TAG_COLORS.map((c) => c.hex),
  description:
    'Tag colour, from the tag palette (the colour name also works). Give related tags related ' +
    `colours and unrelated ones distinct colours. Allowed: ${COLOR_LIST}.`,
} as const;

const tagRefsProperty = (what: string) =>
  ({
    type: 'array',
    items: { type: 'string' },
    description: `${what} Each is a tag id or a tag name (ignoring case) that already exists in the project.`,
  }) as const;

function textResult(text: string, structured: Record<string, unknown>): McpToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new TagToolError(`${name} is required`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new TagToolError(`${name} must be a string`);
  return value.trim();
}

function optionalStringArray(args: Record<string, unknown>, name: string): string[] | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new TagToolError(`${name} must be an array of strings`);
  }
  return value as string[];
}

/**
 * Run `edit` on the project elements doc in one transaction and persist it.
 * `edit` must throw `TagToolError` before writing anything when the request
 * is invalid (a throw also aborts the cleanup). Read-only tools pass
 * `commit: false`.
 */
async function withProjectDoc<T>(
  ctx: McpContext,
  username: string,
  slug: string,
  edit: (doc: Y.Doc) => T,
  options: { commit?: boolean } = {}
): Promise<T> {
  const editable = await openEditableDocument(`${username}:${slug}:elements/`, {
    env: ctx.env,
    authToken: ctx.authToken,
  });
  const write = options.commit !== false;
  const result = editable.doc.transact(() => {
    const value = edit(editable.doc);
    // Writes also clean up duplicates a merge of separately edited copies left.
    if (write) compactTags(editable.doc);
    return value;
  });
  if (write) await editable.commit();
  return result;
}

/** Run a tag tool body, turning `TagToolError`s into tool errors. */
async function runTagTool(
  name: string,
  projectKey: string,
  body: () => Promise<McpToolResult>
): Promise<McpToolResult> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof TagToolError) return errorResult(err.message);
    mcpTagLog.error(`${name} failed for ${projectKey}`, { error: err });
    return errorResult(
      `${name} failed for "${projectKey}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function elementNames(doc: Y.Doc): Map<string, string> {
  const names = new Map<string, string>();
  for (const value of doc.getArray<unknown>('elements').toArray()) {
    const element = value as { id?: unknown; name?: unknown } | null;
    if (typeof element?.id === 'string') {
      names.set(element.id, typeof element.name === 'string' ? element.name : '');
    }
  }
  return names;
}

// ============================================
// list_tags tool
// ============================================

registerTool({
  tool: {
    name: 'list_tags',
    title: 'List Tags',
    description:
      "List the project's tags (id, name, icon, colour, description) with how many elements carry each, " +
      'or, with elementId, the tags on one element. Pass tagId to also get the elements that carry that tag. ' +
      'Call this before tag_element to see which tags exist; make missing ones with create_tag.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        tagId: { type: 'string', description: 'A tag id or name: also list the elements with it.' },
        elementId: { type: 'string', description: 'Only list the tags on this element.' },
      },
      required: ['project'],
    },
    annotations: READ_ONLY_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_ELEMENTS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_ELEMENTS);
    if ('error' in result) return Promise.resolve(result.error);
    const { username, slug } = result.project;

    return runTagTool('list_tags', `${username}/${slug}`, () =>
      withProjectDoc(
        ctx,
        username,
        slug,
        (doc) => {
          const definitions = readTagDefinitions(doc);
          const assignments = readElementTags(doc);
          const names = elementNames(doc);
          const elementId = optionalString(args, 'elementId');
          const tagRef = optionalString(args, 'tagId');

          if (elementId) {
            if (!names.has(elementId)) {
              throw new TagToolError(`element "${elementId}" not found`);
            }
            const tags = tagsForElement(definitions, assignments, elementId).map(presentTag);
            return textResult(JSON.stringify({ elementId, tags }, null, 2), { elementId, tags });
          }

          if (tagRef) {
            const tag = resolveTag(definitions, tagRef);
            const elements = assignments
              .filter((a) => a.tagId === tag.id && names.has(a.elementId))
              .map((a) => ({ id: a.elementId, name: names.get(a.elementId) }));
            const payload = { tag: presentTag(tag), elements };
            return textResult(JSON.stringify(payload, null, 2), payload);
          }

          const tags = definitions.map((tag) => ({
            ...presentTag(tag),
            count: assignments.filter((a) => a.tagId === tag.id && names.has(a.elementId)).length,
          }));
          const payload = { tags };
          const text =
            tags.length === 0
              ? 'This project has no tags yet. Create them with create_tag.'
              : JSON.stringify(payload, null, 2);
          return textResult(text, payload);
        },
        { commit: false }
      )
    );
  },
});

// ============================================
// create_tag tool
// ============================================

registerTool({
  tool: {
    name: 'create_tag',
    title: 'Create Tag',
    annotations: WRITE_TOOL,
    description:
      'Create a tag in the project, with an icon and a colour from the tag palette, so it can be put on ' +
      'elements with tag_element. Tag names are unique in a project (ignoring case): call list_tags first ' +
      'and reuse an existing tag where one fits. Choose an icon and a colour that suit the tag.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        name: { type: 'string', description: 'Tag name, e.g. "Protagonist" or "Needs revision".' },
        icon: iconProperty,
        color: colorProperty,
        description: { type: 'string', description: 'Optional: what the tag is for.' },
      },
      required: ['project', 'name', 'icon', 'color'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return Promise.resolve(result.error);
    const { username, slug } = result.project;

    return runTagTool('create_tag', `${username}/${slug}`, () =>
      withProjectDoc(ctx, username, slug, (doc) => {
        const name = requiredString(args, 'name');
        const icon = normalizeIcon(requiredString(args, 'icon'));
        const color = normalizeColor(requiredString(args, 'color'));
        const description = optionalString(args, 'description');
        assertNameFree(readTagDefinitions(doc), name);

        const tag: TagDefinition = {
          id: newTagId(),
          name,
          icon,
          color,
          ...(description ? { description } : {}),
        };
        doc.getArray<TagDefinition>('customTags').push([tag]);
        return textResult(`Created tag "${name}" (id ${tag.id}, ${icon}, ${color}).`, {
          success: true,
          tag: presentTag(tag),
        });
      })
    );
  },
});

// ============================================
// update_tag tool
// ============================================

registerTool({
  tool: {
    name: 'update_tag',
    title: 'Update Tag',
    annotations: IDEMPOTENT_WRITE_TOOL,
    description:
      'Rename a tag or change its icon, colour or description. Elements keep the tag; they show the new look. ' +
      'Pass description "" to clear it.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        tagId: { type: 'string', description: 'The tag id or name.' },
        name: { type: 'string', description: 'New name.' },
        icon: iconProperty,
        color: colorProperty,
        description: { type: 'string', description: 'New description ("" clears it).' },
      },
      required: ['project', 'tagId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return Promise.resolve(result.error);
    const { username, slug } = result.project;

    return runTagTool('update_tag', `${username}/${slug}`, () =>
      withProjectDoc(ctx, username, slug, (doc) => {
        const definitions = readTagDefinitions(doc);
        const existing = resolveTag(definitions, requiredString(args, 'tagId'));
        const name = optionalString(args, 'name');
        const icon = optionalString(args, 'icon');
        const color = optionalString(args, 'color');
        const description = optionalString(args, 'description');
        if (
          name === undefined &&
          icon === undefined &&
          color === undefined &&
          description === undefined
        ) {
          throw new TagToolError('nothing to change: pass name, icon, color or description');
        }
        if (name !== undefined) {
          if (!name) throw new TagToolError('name cannot be empty');
          assertNameFree(definitions, name, existing.id);
        }

        const updated: TagDefinition = { ...existing };
        if (name !== undefined) updated.name = name;
        if (icon !== undefined) updated.icon = normalizeIcon(icon);
        if (color !== undefined) updated.color = normalizeColor(color);
        if (description === '') delete updated.description;
        else if (description !== undefined) updated.description = description;

        const array = doc.getArray<unknown>('customTags');
        const index = array
          .toArray()
          .findIndex((t) => (t as { id?: unknown } | null)?.id === existing.id);
        array.delete(index, 1);
        array.insert(index, [updated]);
        return textResult(`Updated tag "${updated.name}".`, {
          success: true,
          tag: presentTag(updated),
        });
      })
    );
  },
});

// ============================================
// delete_tag tool
// ============================================

registerTool({
  tool: {
    name: 'delete_tag',
    title: 'Delete Tag',
    description: 'Delete a tag from the project and remove it from every element that has it.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        tagId: { type: 'string', description: 'The tag id or name.' },
      },
      required: ['project', 'tagId'],
    },
    annotations: DESTRUCTIVE_TOOL,
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  execute(ctx: McpContext, _db: unknown, args: Record<string, unknown>): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return Promise.resolve(result.error);
    const { username, slug } = result.project;

    return runTagTool('delete_tag', `${username}/${slug}`, () =>
      withProjectDoc(ctx, username, slug, (doc) => {
        const tag = resolveTag(readTagDefinitions(doc), requiredString(args, 'tagId'));
        const removedFrom = deleteWhere(
          doc.getArray<unknown>('elementTags'),
          (a) => (a as { tagId?: unknown } | null)?.tagId === tag.id
        );
        deleteWhere(
          doc.getArray<unknown>('customTags'),
          (t) => (t as { id?: unknown } | null)?.id === tag.id
        );
        return textResult(
          `Deleted tag "${tag.name}" and removed it from ${removedFrom} element${removedFrom === 1 ? '' : 's'}.`,
          { success: true, deleted: tag.id, removedFrom }
        );
      })
    );
  },
});

// ============================================
// tag_element tool
// ============================================

registerTool({
  tool: {
    name: 'tag_element',
    title: 'Tag Element',
    annotations: IDEMPOTENT_WRITE_TOOL,
    description:
      'Put tags on an element or take them off. Only tags that already exist in the project can be used ' +
      '(see list_tags): create new ones with create_tag first, choosing an icon and colour. If any tag ' +
      'does not exist, nothing is changed and the error lists the available tags. Pass add and/or remove, ' +
      "or set to replace all of the element's tags.",
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        elementId: { type: 'string', description: 'The ID of the element to tag.' },
        add: tagRefsProperty('Tags to put on the element.'),
        remove: tagRefsProperty('Tags to take off the element.'),
        set: tagRefsProperty("Replace all of the element's tags with these ([] removes them all)."),
      },
      required: ['project', 'elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    db: DatabaseInstance,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    return runTagTool('tag_element', `${username}/${slug}`, async () => {
      const { response, change } = await withProjectDoc(ctx, username, slug, (doc) => {
        const elementId = requiredString(args, 'elementId');
        const add = optionalStringArray(args, 'add');
        const remove = optionalStringArray(args, 'remove');
        const set = optionalStringArray(args, 'set');
        if (set && (add || remove)) {
          throw new TagToolError('pass either set, or add and/or remove, not both');
        }
        if (!set && !add?.length && !remove?.length) {
          throw new TagToolError('pass add, remove or set');
        }

        const names = elementNames(doc);
        if (!readElementIds(doc).has(elementId)) {
          throw new TagToolError(`element "${elementId}" not found`);
        }

        // Resolve every tag before writing, so an unknown one changes nothing.
        const definitions = readTagDefinitions(doc);
        const toSet = set ? resolveTags(definitions, set) : null;
        const toAdd = add ? resolveTags(definitions, add) : [];
        const toRemove = remove ? resolveTags(definitions, remove) : [];

        const before = tagsForElement(definitions, readElementTags(doc), elementId);
        if (toSet) {
          removeElementTags(doc, elementId);
          addElementTags(
            doc,
            elementId,
            toSet.map((t) => t.id)
          );
        } else {
          if (toRemove.length > 0) {
            removeElementTags(
              doc,
              elementId,
              toRemove.map((t) => t.id)
            );
          }
          addElementTags(
            doc,
            elementId,
            toAdd.map((t) => t.id)
          );
        }
        const after = tagsForElement(definitions, readElementTags(doc), elementId);

        const elementName = names.get(elementId) ?? '';
        const beforeNames = before.map((t) => t.name);
        const afterNames = after.map((t) => t.name);
        const list = afterNames.length > 0 ? afterNames.join(', ') : '(no tags)';
        return {
          response: textResult(`Tags on "${elementName}": ${list}`, {
            success: true,
            elementId,
            elementName,
            tags: after.map(presentTag),
          }),
          change:
            beforeNames.join('\n') === afterNames.join('\n')
              ? null
              : { elementId, elementName, previousTags: beforeNames, newTags: afterNames },
        };
      });

      if (change) {
        await activityService.record(db, {
          projectId,
          userId: ctx.userId,
          eventType: 'element_tagged',
          entityId: change.elementId,
          entityName: change.elementName,
          metadata: { previousTags: change.previousTags, newTags: change.newTags },
        });
      }
      return response;
    });
  },
});
