import type { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { type Element, ElementType } from '@inkweld/index';
import {
  type DocumentRole,
  SCENE_METADATA_KEYS,
  SCENE_STATUSES,
  type SceneStatus,
} from '@models/scene-metadata';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { TagService } from '@services/tag/tag.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

import type { ElementPreset } from '../../../dialogs/new-element-dialog/new-element-dialog.component';
import { writeDocumentFromMarkdown } from './document.tools';
import {
  ELEMENT_TYPE_HELP,
  ELEMENT_TYPES,
  type ProjectToolContext,
} from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

const VIEWS = [
  'home',
  'media',
  'settings',
  'publish-plans',
  'activity',
] as const;
type View = (typeof VIEWS)[number];

const DOCUMENT_KINDS = ['scene', 'note', 'conversation'] as const;
const CANVAS_KINDS = ['blank', 'map', 'cover'] as const;

/** The children of `parentId` (null = root) in tree order. */
function childrenOf(
  elements: Element[],
  tree: ElementTreeService,
  parentId: string | null
): { child: Element; index: number }[] {
  if (parentId === null) {
    return elements
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => child.level === 0);
  }
  const parentIndex = elements.findIndex(e => e.id === parentId);
  if (parentIndex === -1) return [];
  const level = elements[parentIndex].level + 1;
  return tree
    .getSubtree(elements, parentIndex)
    .map(child => ({ child, index: elements.indexOf(child) }))
    .filter(({ child }) => child.level === level);
}

/**
 * The project tree and the elements in it: browse, create, rename, move,
 * delete, and the tabs and views of the project page.
 */
export function elementTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const tree = injector.get(ElementTreeService);

  function folder(parentId: string): Element {
    const parent = ctx.element(parentId);
    if (parent.type !== ElementType.Folder) {
      throw new ToolError(
        `"${parent.name}" is a ${parent.type}; only folders can hold other elements.`
      );
    }
    return parent;
  }

  return [
    {
      name: 'get_project',
      title: 'Get project details',
      description:
        'Title, description and owner of the open project, how many elements of each type it has, the pinned elements, and whether you can edit it.',
      inputSchema: schema(),
      readOnly: true,
      untrustedContent: true,
      run: () => {
        const project = ctx.project();
        const counts: Record<string, number> = {};
        for (const element of ctx.elements()) {
          counts[element.type] = (counts[element.type] ?? 0) + 1;
        }
        return {
          username: project.username,
          slug: project.slug,
          title: project.title,
          description: project.description ?? '',
          canWrite: ctx.state.canWrite(),
          elementCounts: counts,
          pinnedElementIds: ctx.state.pinnedElementIds(),
        };
      },
    },
    {
      name: 'update_project',
      writes: true,
      title: 'Update project details',
      description: "Change the open project's title or description.",
      inputSchema: schema({
        title: { type: 'string' },
        description: { type: 'string' },
      }),
      run: async args => {
        ctx.requireWrite();
        const project = ctx.project();
        const updates: { title?: string; description?: string } = {};
        const title = args.optionalString('title')?.trim();
        if (title !== undefined) {
          if (!title) throw new ToolError('"title" cannot be empty.');
          updates.title = title;
        }
        const description = args.optionalString('description');
        if (description !== undefined) updates.description = description;
        if (Object.keys(updates).length === 0) {
          throw new ToolError('Give a title or a description to change.');
        }
        const updated = await injector
          .get(UnifiedProjectService)
          .updateProject(project.username, project.slug, updates);
        ctx.state.updateProject({ ...project, ...updates, ...updated });
        return { ok: true, ...updates };
      },
    },
    {
      name: 'get_project_tree',
      title: 'Get project tree',
      description: `The elements of the open project in tree order (folders before their contents). Element types: ${ELEMENT_TYPE_HELP}`,
      inputSchema: schema({
        parentId: {
          type: 'string',
          description: 'Only the contents of this folder.',
        },
        maxDepth: {
          type: 'integer',
          minimum: 0,
          description:
            'Stop this many levels below the starting point (0 = direct children only).',
        },
        type: {
          type: 'string',
          enum: ELEMENT_TYPES,
          description: 'Only elements of this type (folders are still listed).',
        },
      }),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        ctx.project();
        const elements = ctx.elements();
        const parentId = args.optionalString('parentId');
        let scope = elements;
        let baseLevel = 0;
        if (parentId) {
          const parent = ctx.element(parentId);
          const index = elements.indexOf(parent);
          scope = tree.getSubtree(elements, index).slice(1);
          baseLevel = parent.level + 1;
        }
        const maxDepth = args.optionalInteger('maxDepth', { min: 0 });
        const type = args.optionalOneOf('type', ELEMENT_TYPES);
        const listed = scope.filter(
          e =>
            (maxDepth === undefined || e.level - baseLevel <= maxDepth) &&
            (!type || e.type === type || e.type === ElementType.Folder)
        );
        return {
          total: elements.length,
          elements: listed.map(e => ctx.summarize(e)),
        };
      },
    },
    {
      name: 'search_elements',
      title: 'Find elements by name',
      description:
        'Find elements whose name contains the given text (case-insensitive). For text inside documents use search_text.',
      inputSchema: schema(
        {
          query: { type: 'string' },
          type: { type: 'string', enum: ELEMENT_TYPES },
          schemaId: {
            type: 'string',
            description: 'Only worldbuilding elements of this template.',
          },
          tagId: {
            type: 'string',
            description: 'Only elements with this tag.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        },
        ['query']
      ),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        ctx.project();
        const query = (args.optionalString('query') ?? '').toLowerCase();
        const type = args.optionalOneOf('type', ELEMENT_TYPES);
        const schemaId = args.optionalString('schemaId');
        const tagId = args.optionalString('tagId');
        const limit = args.optionalInteger('limit', { min: 1, max: 200 }) ?? 50;
        const tags = injector.get(TagService);
        const matches = ctx
          .elements()
          .filter(
            e =>
              e.name.toLowerCase().includes(query) &&
              (!type || e.type === type) &&
              (!schemaId || e.schemaId === schemaId) &&
              (!tagId || tags.hasTag(e.id, tagId))
          );
        return {
          total: matches.length,
          elements: matches.slice(0, limit).map(e => ctx.summarize(e)),
        };
      },
    },
    {
      name: 'get_element',
      title: 'Get element',
      description:
        'One element with its place in the tree, metadata, direct children, tags and relationship counts.',
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        const element = ctx.element(args.string('elementId'));
        const tags = injector.get(TagService);
        return {
          ...ctx.summarize(element),
          metadata: element.metadata ?? {},
          children: childrenOf(ctx.elements(), tree, element.id).map(
            ({ child }) => ({
              id: child.id,
              name: child.name,
              type: child.type,
            })
          ),
          tags: tags
            .getResolvedTagsForElement(element.id)
            .map(t => ({ id: t.definition.id, name: t.definition.name })),
          relationships: injector
            .get(RelationshipService)
            .getRelationshipCount(element.id),
        };
      },
    },
    {
      name: 'create_element',
      writes: true,
      title: 'Create element',
      description: `Add an element to the project tree, as the New element dialog does. Types: ${ELEMENT_TYPE_HELP} A WORLDBUILDING element needs a schemaId from list_schemas. It goes first in parentId, or right after afterId, or first at the root. Fill a document with update_document_content afterwards (or pass content here).`,
      inputSchema: schema(
        {
          type: { type: 'string', enum: ELEMENT_TYPES },
          name: { type: 'string' },
          parentId: {
            type: 'string',
            description: 'Folder to create it in (as its first item).',
          },
          afterId: {
            type: 'string',
            description:
              'Place it right after this element, in the same folder. Use it to append: pass the last child.',
          },
          schemaId: {
            type: 'string',
            description: 'WORLDBUILDING only: the template to build it from.',
          },
          documentKind: {
            type: 'string',
            enum: DOCUMENT_KINDS,
            description:
              'ITEM only: a manuscript scene, a note, or a scene written as a conversation (speech bubbles).',
          },
          canvasKind: {
            type: 'string',
            enum: CANVAS_KINDS,
            description:
              'CANVAS only: a blank canvas, an interactive map, or the project cover.',
          },
          content: {
            type: 'string',
            description: 'ITEM only: initial text, as Markdown.',
          },
          open: {
            type: 'boolean',
            description: 'Open it in a tab afterwards (default false).',
          },
        },
        ['type', 'name']
      ),
      run: async args => {
        ctx.requireWrite();
        const type = args.oneOf('type', ELEMENT_TYPES);
        const name = args.string('name').trim();
        const parentId = args.optionalString('parentId');
        const afterId = args.optionalString('afterId');
        if (parentId) folder(parentId);
        if (afterId) ctx.element(afterId);
        const schemaId = args.optionalString('schemaId');
        if (type === ElementType.Worldbuilding) {
          if (!schemaId) {
            throw new ToolError(
              'A WORLDBUILDING element needs a schemaId. Call list_schemas.'
            );
          }
          if (!injector.get(WorldbuildingService).getSchemaById(schemaId)) {
            throw new ToolError(
              `No template with id "${schemaId}". Call list_schemas.`
            );
          }
        } else if (schemaId) {
          throw new ToolError('schemaId only applies to WORLDBUILDING.');
        }
        const documentKind = args.optionalOneOf('documentKind', DOCUMENT_KINDS);
        const canvasKind = args.optionalOneOf('canvasKind', CANVAS_KINDS);
        const content = args.optionalString('content');
        if ((documentKind || content) && type !== ElementType.Item) {
          throw new ToolError('documentKind and content only apply to ITEM.');
        }
        if (canvasKind && type !== ElementType.Canvas) {
          throw new ToolError('canvasKind only applies to CANVAS.');
        }
        let preset: ElementPreset | undefined = documentKind;
        if (canvasKind && canvasKind !== 'blank') preset = canvasKind;

        const created = ctx.state.createElement(type, name, {
          parentId: afterId ? undefined : parentId,
          afterElementId: afterId,
          schemaId,
          preset,
        });
        if (!created) throw new ToolError('The element could not be created.');
        if (content) {
          await writeDocumentFromMarkdown(injector, ctx, created.id, content);
        }
        if (args.optionalBoolean('open')) {
          injector.get(ElementNavigationService).openElement(created);
        }
        return ctx.summarize(created);
      },
    },
    {
      name: 'update_element',
      writes: true,
      title: 'Update element',
      description:
        "Rename an element, pin or unpin it, or change a document's kind (scene/note), format (prose/conversation) and scene details (synopsis, status, word target). Only the fields given change.",
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          name: { type: 'string' },
          pinned: { type: 'boolean' },
          role: {
            type: 'string',
            enum: ['scene', 'note'],
            description: 'ITEM only.',
          },
          format: {
            type: 'string',
            enum: ['prose', 'conversation'],
            description: 'ITEM only. Switching never loses content.',
          },
          synopsis: { type: 'string', description: 'Scenes only.' },
          status: {
            type: 'string',
            enum: SCENE_STATUSES,
            description: 'Scenes only.',
          },
          wordTarget: {
            type: 'integer',
            minimum: 0,
            description: 'Scenes only; 0 clears it.',
          },
        },
        ['elementId']
      ),
      run: args => {
        ctx.requireWrite();
        const element = ctx.element(args.string('elementId'));
        const name = args.optionalString('name')?.trim();
        if (name !== undefined) {
          if (!name) throw new ToolError('"name" cannot be empty.');
          ctx.state.renameNode(element, name);
        }
        const pinned = args.optionalBoolean('pinned');
        if (pinned !== undefined && pinned !== ctx.state.isPinned(element.id)) {
          ctx.state.togglePin(element.id);
        }
        const role = args.optionalOneOf<DocumentRole>('role', [
          'scene',
          'note',
        ]);
        const format = args.optionalOneOf('format', [
          'prose',
          'conversation',
        ] as const);
        const synopsis = args.optionalString('synopsis');
        const status = args.optionalOneOf<SceneStatus>(
          'status',
          SCENE_STATUSES
        );
        const wordTarget = args.optionalInteger('wordTarget', { min: 0 });
        const touchesDocument =
          role ||
          format ||
          synopsis !== undefined ||
          status ||
          wordTarget !== undefined;
        if (touchesDocument && element.type !== ElementType.Item) {
          throw new ToolError(
            'role, format, synopsis, status and wordTarget only apply to documents (ITEM).'
          );
        }
        if (role) ctx.state.setDocumentRole(element.id, role);
        if (format) ctx.state.setDocumentFormat(element.id, format);
        const scene: Record<string, string> = {};
        if (synopsis !== undefined)
          scene[SCENE_METADATA_KEYS.synopsis] = synopsis;
        if (status) scene[SCENE_METADATA_KEYS.status] = status;
        if (wordTarget !== undefined) {
          scene[SCENE_METADATA_KEYS.wordTarget] =
            wordTarget === 0 ? '' : String(wordTarget);
        }
        if (Object.keys(scene).length > 0) {
          ctx.state.updateElementMetadata(element.id, scene);
        }
        return ctx.summarize(ctx.element(element.id));
      },
    },
    {
      name: 'move_element',
      writes: true,
      title: 'Move element',
      description:
        "Move an element, with everything inside it, into a folder (or to the root) at a position among that folder's items.",
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          parentId: {
            type: ['string', 'null'],
            description: 'Destination folder; null for the root.',
          },
          position: {
            type: 'integer',
            minimum: 0,
            description:
              "Index among the destination's items (0 = first). Defaults to last.",
          },
        },
        ['elementId', 'parentId']
      ),
      run: args => {
        ctx.requireWrite();
        const element = ctx.element(args.string('elementId'));
        const parentId = args.nullableString('parentId') ?? null;
        const elements = ctx.elements();
        if (parentId !== null) {
          folder(parentId);
          if (
            parentId === element.id ||
            tree.isDescendantOf(elements, parentId, element.id)
          ) {
            throw new ToolError('An element cannot be moved into itself.');
          }
        }
        const siblings = childrenOf(elements, tree, parentId).filter(
          ({ child }) => child.id !== element.id
        );
        const position =
          args.optionalInteger('position', { min: 0 }) ?? siblings.length;
        let targetIndex: number;
        if (position < siblings.length) {
          targetIndex = siblings[position].index;
        } else if (parentId === null) {
          targetIndex = elements.length;
        } else {
          const parentIndex = elements.findIndex(e => e.id === parentId);
          targetIndex =
            parentIndex + tree.getSubtree(elements, parentIndex).length;
        }
        const level = parentId === null ? 0 : ctx.element(parentId).level + 1;
        ctx.state.moveElement(element.id, targetIndex, level);
        if (parentId) ctx.state.setExpanded(parentId, true);
        return ctx.summarize(ctx.element(element.id));
      },
    },
    {
      name: 'delete_element',
      writes: true,
      title: 'Delete element',
      description:
        'Delete an element and everything inside it, with their relationships. This cannot be undone from here; ask the user first, and consider create_snapshot.',
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      consequential: true,
      run: args => {
        ctx.requireWrite();
        const element = ctx.element(args.string('elementId'));
        const elements = ctx.elements();
        const removed = tree.getSubtree(elements, elements.indexOf(element));
        ctx.state.closeTabByElementId(element.id);
        ctx.state.deleteElement(element.id);
        return {
          deleted: removed.map(e => ({ id: e.id, name: e.name, type: e.type })),
        };
      },
    },
    {
      name: 'open_element',
      title: 'Open element',
      description:
        "Show an element to the user in its own tab: a document in the editor, a worldbuilding entry, a canvas, a folder's corkboard.",
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      run: args => {
        const element = ctx.element(args.string('elementId'));
        injector.get(ElementNavigationService).openElement(element);
        return { opened: element.name };
      },
    },
    {
      name: 'open_view',
      title: 'Open project view',
      description:
        "Show one of the project's own pages: home (overview), media library, settings (templates, relationship types, tags and project options), publish-plans, or activity.",
      inputSchema: schema({ view: { type: 'string', enum: VIEWS } }, ['view']),
      run: async args => {
        const project = ctx.project();
        const view: View = args.oneOf('view', VIEWS);
        const router = injector.get(Router);
        if (view === 'home') {
          ctx.state.openHomeTab();
          await router.navigate(['/', project.username, project.slug]);
        } else {
          const { index } = ctx.state.openSystemTab(view);
          ctx.state.selectTab(index);
          await router.navigate(['/', project.username, project.slug, view]);
        }
        return { opened: view };
      },
    },
    {
      name: 'close_tab',
      title: 'Close tab',
      description:
        'Close an open tab, by the element it shows or by its index from get_app_state.',
      inputSchema: schema({
        elementId: { type: 'string' },
        index: { type: 'integer', minimum: 0 },
      }),
      run: args => {
        ctx.project();
        const elementId = args.optionalString('elementId');
        const index = args.optionalInteger('index', { min: 0 });
        if (elementId) {
          ctx.state.closeTabByElementId(elementId);
        } else if (index !== undefined) {
          if (index >= ctx.state.openTabs().length) {
            throw new ToolError(`There is no tab ${index}.`);
          }
          ctx.state.closeTab(index);
        } else {
          throw new ToolError('Give elementId or index.');
        }
        return { openTabs: ctx.state.openTabs().map(t => t.name) };
      },
    },
    {
      name: 'export_project',
      title: 'Export project archive',
      description:
        "Download the whole project as an .inkweld.zip archive (documents, worldbuilding, media, snapshots) to the user's computer.",
      inputSchema: schema(),
      readOnly: true,
      run: async () => {
        ctx.project();
        await injector.get(ProjectExportService).exportProject();
        return { ok: true, message: 'The archive download has started.' };
      },
    },
  ];
}
