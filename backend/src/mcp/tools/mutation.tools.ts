/**
 * MCP Tools: Mutation Operations
 *
 * Tools for creating, updating, and deleting elements and worldbuilding data.
 * Changes sync in real-time to all connected clients via Yjs.
 *
 * All tools require a `project` parameter in the format "username/slug" to specify
 * which project to operate on. This enables multi-project access for OAuth authentication.
 *
 * IMPORTANT: Inkweld uses a **positional hierarchy** model:
 * - Elements are stored in a flat array
 * - Parent-child relationships are determined by ARRAY POSITION + LEVEL
 * - Children must IMMEDIATELY FOLLOW their parent in the array
 * - A child's level must be exactly parent.level + 1
 *
 * This file uses helper functions from tree-helpers.ts to maintain this structure.
 *
 * Runtime-aware: Works on both Bun (LevelDB) and Cloudflare Workers (DO HTTP API).
 */

import { nanoid } from 'nanoid';
import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult, ActiveProjectContext } from '../mcp.types';
import { getProjectByKey, hasProjectPermission } from '../mcp.types';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { Element, ElementType, ELEMENT_TYPES } from '../../schemas/element.schemas';
import { logger } from '../../services/logger.service';
import {
  isCloudflareWorkers,
  getElements as runtimeGetElements,
  replaceAllElements as runtimeReplaceAllElements,
  getWorldbuildingDoc,
  updateWorldbuilding,
  getRelationships as runtimeGetRelationships,
  replaceAllRelationships as runtimeReplaceAllRelationships,
  addRelationship as runtimeAddRelationship,
  type Relationship,
} from './yjs-runtime';

const mcpMutLog = logger.child('MCP-Mutation');
import {
  insertElement,
  removeElement,
  moveElement,
  sortChildren,
  normalizeElements,
  getSubtree,
  findParentByPosition,
} from './tree-helpers';

/**
 * Common project parameter schema for all mutation tools
 */
const projectPropertySchema = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use inkweld://projects resource to list available projects.',
} as const;

/**
 * Parse project parameter and validate permission
 * Returns project context or error result
 */
function parseProjectParam(
  ctx: McpContext,
  projectArg: unknown,
  permission: string
): { project: ActiveProjectContext } | { error: McpToolResult } {
  const projectStr = String(projectArg ?? '').trim();
  if (!projectStr) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: 'Error: project parameter is required. Use "username/slug" format.',
          },
        ],
        isError: true,
      },
    };
  }

  const parts = projectStr.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: invalid project format "${projectStr}". Use "username/slug" format.`,
          },
        ],
        isError: true,
      },
    };
  }

  const [username, slug] = parts;
  const project = getProjectByKey(ctx, username, slug);

  if (!project) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: No access to project "${projectStr}". Check your authorized projects.`,
          },
        ],
        isError: true,
      },
    };
  }

  if (!hasProjectPermission(ctx, username, slug, permission)) {
    return {
      error: {
        content: [
          {
            type: 'text',
            text: `Error: No "${permission}" permission for project "${projectStr}".`,
          },
        ],
        isError: true,
      },
    };
  }

  return { project };
}

// ============================================
// create_element tool
// ============================================

registerTool({
  tool: {
    name: 'create_element',
    title: 'Create Element',
    description: `Create a new element in the project tree. Returns the ID of the created element.

IMPORTANT: Elements use positional hierarchy. The new element will be inserted:
- At the END of the parent's children (if parentId specified)
- At the END of root elements (if no parentId)

Use move_elements or reorder_element to reposition after creation.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        name: {
          type: 'string',
          description: 'Name of the element',
        },
        type: {
          type: 'string',
          enum: ELEMENT_TYPES,
          description: 'Type of element: FOLDER, ITEM (document), WORLDBUILDING',
        },
        parentId: {
          type: 'string',
          description: 'Optional parent element ID. If omitted, creates at root level.',
        },
      },
      required: ['project', 'name', 'type'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const name = String(args.name ?? '').trim();
    const type = String(args.type ?? 'ITEM') as ElementType;
    const parentId = args.parentId ? String(args.parentId) : null;

    // Validate
    if (!name) {
      return {
        content: [{ type: 'text', text: 'Error: name is required' }],
        isError: true,
      };
    }

    if (!ELEMENT_TYPES.includes(type)) {
      return {
        content: [{ type: 'text', text: `Error: invalid type "${type}"` }],
        isError: true,
      };
    }

    try {
      const currentElements = await runtimeGetElements(ctx, username, slug);

      // Create new element (level will be set by insertElement)
      const newElement: Element = {
        id: nanoid(),
        name,
        type,
        parentId,
        level: 0, // Will be calculated
        expandable: type === 'FOLDER',
        order: 0, // Will be calculated
        version: 0,
        metadata: {},
      };

      // Insert at correct position
      let updatedElements: Element[];
      try {
        updatedElements = insertElement(currentElements, newElement, parentId);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        };
      }

      // Replace entire array (maintains positional integrity)
      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      // Find the inserted element to return it
      const insertedElement = updatedElements.find((e) => e.id === newElement.id);

      return {
        content: [
          {
            type: 'text',
            text: `Created ${type} "${name}" with ID ${newElement.id}`,
          },
        ],
        structuredContent: {
          success: true,
          element: insertedElement,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error creating element', err);
      return {
        content: [{ type: 'text', text: `Error creating element: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// replace_all_elements tool
// ============================================

registerTool({
  tool: {
    name: 'replace_all_elements',
    title: 'Replace All Elements',
    description: `Replace all elements in the project with a new set.

CRITICAL: Elements must be in correct positional order:
- Children must IMMEDIATELY FOLLOW their parent in the array
- Level must be correct (parent.level + 1 for children)
- The array order determines the tree structure

This tool will normalize the elements (fix order values and parentIds).

WARNING: This will delete all existing elements and replace them.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique element ID' },
              name: { type: 'string', description: 'Element name' },
              type: {
                type: 'string',
                enum: ELEMENT_TYPES,
                description: 'Element type',
              },
              level: {
                type: 'number',
                description: 'Nesting level (0 for root, 1 for first-level children, etc.)',
              },
            },
            required: ['id', 'name', 'type', 'level'],
          },
          description: `Array of elements in POSITIONAL ORDER:
- Root elements at level 0
- Children immediately after their parent at level parent+1
- Example: [Folder(L0), Child1(L1), Child2(L1), NextFolder(L0), ...]`,
        },
      },
      required: ['project', 'elements'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const inputElements = args.elements as Array<{
      id: string;
      name: string;
      type: string;
      level: number;
      expandable?: boolean;
    }>;

    if (!inputElements || !Array.isArray(inputElements)) {
      return {
        content: [{ type: 'text', text: 'Error: elements array is required' }],
        isError: true,
      };
    }

    try {
      // Build proper Element objects with correct positional parentIds
      const rawElements: Element[] = inputElements.map((e, index) => ({
        id: e.id,
        name: e.name,
        type: e.type as ElementType,
        parentId: null, // Will be set by normalizeElements
        level: e.level,
        expandable: e.expandable ?? e.type === 'FOLDER',
        order: index,
        version: 0,
        metadata: {},
      }));

      // Normalize to fix parentIds based on positional hierarchy
      const newElements = normalizeElements(rawElements);

      // Replace all elements
      await runtimeReplaceAllElements(ctx, username, slug, newElements);

      return {
        content: [
          {
            type: 'text',
            text: `Replaced all elements with ${newElements.length} new elements`,
          },
        ],
        structuredContent: {
          success: true,
          count: newElements.length,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error replacing elements', err);
      return {
        content: [{ type: 'text', text: `Error replacing elements: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// update_element tool
// ============================================

registerTool({
  tool: {
    name: 'update_element',
    title: 'Update Element',
    description: `Update an existing element's properties (name, type).

NOTE: To change an element's parent or position, use move_elements instead.
This tool only updates name and type without changing position.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the element to update',
        },
        name: {
          type: 'string',
          description: 'New name for the element',
        },
        type: {
          type: 'string',
          enum: ELEMENT_TYPES,
          description: 'New type for the element',
        },
      },
      required: ['project', 'elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId);
    const newName = args.name !== undefined ? String(args.name).trim() : undefined;
    const newType = args.type !== undefined ? (String(args.type) as ElementType) : undefined;

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (newType && !ELEMENT_TYPES.includes(newType)) {
      return {
        content: [{ type: 'text', text: `Error: invalid type "${newType}"` }],
        isError: true,
      };
    }

    if (newName === undefined && newType === undefined) {
      return {
        content: [{ type: 'text', text: 'Error: at least one of name or type must be provided' }],
        isError: true,
      };
    }

    try {
      const currentElements = await runtimeGetElements(ctx, username, slug);

      const index = currentElements.findIndex((e) => e.id === elementId);
      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
          isError: true,
        };
      }

      const element = currentElements[index];

      // Build updated element (keep position unchanged)
      const updatedElement: Element = {
        ...element,
        name: newName ?? element.name,
        type: newType ?? element.type,
        version: element.version + 1,
        expandable: (newType ?? element.type) === 'FOLDER',
      };

      // Update in place (no position change)
      const updatedElements = [...currentElements];
      updatedElements[index] = updatedElement;

      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      const changes: string[] = [];
      if (newName !== undefined) changes.push(`name="${newName}"`);
      if (newType !== undefined) changes.push(`type=${newType}`);

      return {
        content: [
          {
            type: 'text',
            text: `Updated element "${element.name}": ${changes.join(', ')}`,
          },
        ],
        structuredContent: {
          success: true,
          element: updatedElement,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error updating element', err);
      return {
        content: [{ type: 'text', text: `Error updating element: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// delete_element tool
// ============================================

registerTool({
  tool: {
    name: 'delete_element',
    title: 'Delete Element',
    description: `Delete an element from the project.

WARNING: This also deletes all POSITIONAL descendants (children that follow
this element in the array at deeper levels).`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the element to delete',
        },
      },
      required: ['project', 'elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId);

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    try {
      const currentElements = await runtimeGetElements(ctx, username, slug);

      const index = currentElements.findIndex((e) => e.id === elementId);
      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
          isError: true,
        };
      }

      const element = currentElements[index];
      const subtree = getSubtree(currentElements, index);

      // Remove element and its subtree
      const updatedElements = removeElement(currentElements, elementId);

      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      return {
        content: [
          {
            type: 'text',
            text: `Deleted element "${element.name}" and ${subtree.length - 1} descendants`,
          },
        ],
        structuredContent: {
          success: true,
          deletedIds: subtree.map((e) => e.id),
          deletedCount: subtree.length,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error deleting element', err);
      return {
        content: [{ type: 'text', text: `Error deleting element: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// move_elements tool
// ============================================

registerTool({
  tool: {
    name: 'move_elements',
    title: 'Move Elements',
    description: `Move one or more elements to a different parent folder.

This properly handles the positional hierarchy:
- Elements (and their subtrees) are removed from their current position
- They are inserted at the end of the new parent's children
- All levels are adjusted automatically

To move multiple elements, call this tool multiple times or provide all IDs.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of element IDs to move',
        },
        newParentId: {
          type: 'string',
          description: 'ID of the new parent folder. Use null or empty string for root level.',
        },
      },
      required: ['project', 'elementIds'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementIds = args.elementIds as string[] | undefined;
    const newParentId =
      args.newParentId === '' || args.newParentId === null || args.newParentId === undefined
        ? null
        : String(args.newParentId);

    if (!elementIds || !Array.isArray(elementIds) || elementIds.length === 0) {
      return {
        content: [{ type: 'text', text: 'Error: elementIds array is required' }],
        isError: true,
      };
    }

    try {
      let currentElements = await runtimeGetElements(ctx, username, slug);

      // Validate new parent exists (if specified)
      if (newParentId) {
        const parent = currentElements.find((e) => e.id === newParentId);
        if (!parent) {
          return {
            content: [{ type: 'text', text: `Error: parent "${newParentId}" not found` }],
            isError: true,
          };
        }
        if (parent.type !== 'FOLDER') {
          return {
            content: [{ type: 'text', text: `Error: parent "${newParentId}" is not a folder` }],
            isError: true,
          };
        }
      }

      // Move each element
      const movedElements: string[] = [];
      const errors: string[] = [];

      for (const id of elementIds) {
        try {
          currentElements = moveElement(currentElements, id, newParentId);
          const el = currentElements.find((e) => e.id === id);
          if (el) movedElements.push(el.name);
        } catch (err) {
          errors.push(`${id}: ${err}`);
        }
      }

      if (movedElements.length === 0) {
        return {
          content: [
            { type: 'text', text: `Error: no elements moved. Errors: ${errors.join(', ')}` },
          ],
          isError: true,
        };
      }

      await runtimeReplaceAllElements(ctx, username, slug, currentElements);

      return {
        content: [
          {
            type: 'text',
            text: `Moved ${movedElements.length} elements to ${newParentId || 'root'}: ${movedElements.join(', ')}${errors.length > 0 ? ` (errors: ${errors.join(', ')})` : ''}`,
          },
        ],
        structuredContent: {
          success: true,
          movedCount: movedElements.length,
          movedElements,
          newParentId,
          errors,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error moving elements', err);
      return {
        content: [{ type: 'text', text: `Error moving elements: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// reorder_element tool
// ============================================

registerTool({
  tool: {
    name: 'reorder_element',
    title: 'Reorder Element',
    description: `Move an element to a different position within its parent (reorder siblings).

This uses positional hierarchy - it moves the element (and its subtree)
to a new position among its siblings.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the element to move',
        },
        afterElementId: {
          type: 'string',
          description:
            'Move after this sibling element ID. The moved element will appear immediately after this sibling (and after its children).',
        },
        position: {
          type: 'number',
          description:
            'Alternative to afterElementId: position among siblings (0 = first, -1 = last). Only used if afterElementId not provided.',
        },
      },
      required: ['project', 'elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId);
    const afterElementId = args.afterElementId ? String(args.afterElementId) : undefined;
    const position = args.position !== undefined ? Number(args.position) : undefined;

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (afterElementId === undefined && position === undefined) {
      return {
        content: [{ type: 'text', text: 'Error: either afterElementId or position is required' }],
        isError: true,
      };
    }

    try {
      const currentElements = await runtimeGetElements(ctx, username, slug);

      const elementIndex = currentElements.findIndex((e) => e.id === elementId);
      if (elementIndex === -1) {
        return {
          content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
          isError: true,
        };
      }

      const element = currentElements[elementIndex];
      const parentId = findParentByPosition(currentElements, elementIndex)?.id ?? null;

      // Get siblings (same parent)
      const siblings: { element: Element; index: number }[] = [];
      for (let i = 0; i < currentElements.length; i++) {
        const parent = findParentByPosition(currentElements, i);
        if ((parent?.id ?? null) === parentId) {
          siblings.push({ element: currentElements[i], index: i });
        }
      }

      // Determine the sibling to insert after
      let insertAfterSiblingId: string | undefined;

      if (afterElementId) {
        // Validate that afterElementId is a sibling
        const isSibling = siblings.some((s) => s.element.id === afterElementId);
        if (!isSibling) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: "${afterElementId}" is not a sibling of "${elementId}"`,
              },
            ],
            isError: true,
          };
        }
        insertAfterSiblingId = afterElementId;
      } else if (position !== undefined) {
        if (position === 0) {
          // Move to first position - no afterSiblingId (insert at start of parent's children)
          insertAfterSiblingId = undefined;
        } else if (position === -1 || position >= siblings.length - 1) {
          // Move to last position
          const lastSibling = siblings[siblings.length - 1];
          if (lastSibling.element.id !== elementId) {
            insertAfterSiblingId = lastSibling.element.id;
          }
        } else {
          // Move to specific position
          const siblingBefore = siblings[position - 1];
          if (siblingBefore && siblingBefore.element.id !== elementId) {
            insertAfterSiblingId = siblingBefore.element.id;
          }
        }
      }

      // Use moveElement to reposition within the same parent
      let updatedElements: Element[];
      try {
        updatedElements = moveElement(currentElements, elementId, parentId, insertAfterSiblingId);
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        };
      }

      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      return {
        content: [
          {
            type: 'text',
            text: `Reordered element "${element.name}"${afterElementId ? ` after "${afterElementId}"` : ` to position ${position}`}`,
          },
        ],
        structuredContent: {
          success: true,
          elementId,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error reordering element', err);
      return {
        content: [{ type: 'text', text: `Error reordering element: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// sort_elements tool
// ============================================

registerTool({
  tool: {
    name: 'sort_elements',
    title: 'Sort Elements',
    description: `Sort children of a folder alphabetically or by type.

This properly handles positional hierarchy - subtrees move with their parents.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        parentId: {
          type: 'string',
          description:
            'ID of the parent folder to sort children of. Use null or empty for root level.',
        },
        sortBy: {
          type: 'string',
          enum: ['name', 'type', 'type-then-name'],
          description:
            'How to sort: "name" (alphabetically), "type" (folders first, then by type), "type-then-name" (by type, then alphabetically within type). Default: "name"',
        },
        descending: {
          type: 'boolean',
          description: 'Sort in descending order (Z-A). Default: false',
        },
        foldersFirst: {
          type: 'boolean',
          description: 'Always put folders at the top. Default: true',
        },
        recursive: {
          type: 'boolean',
          description: 'Also sort all descendant folders. Default: false',
        },
      },
      required: ['project'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const parentId =
      args.parentId === '' || args.parentId === null || args.parentId === undefined
        ? null
        : String(args.parentId);
    const sortBy = (args.sortBy as string) || 'name';
    const descending = Boolean(args.descending);
    const foldersFirst = args.foldersFirst !== false; // Default true
    const recursive = Boolean(args.recursive);

    try {
      const currentElements = await runtimeGetElements(ctx, username, slug);

      // Type order for sorting
      const typeOrder: Record<string, number> = {
        FOLDER: 0,
        ITEM: 1,
        WORLDBUILDING: 2,
      };

      // Sort function
      const compareFn = (a: Element, b: Element): number => {
        // Folders first (if enabled)
        if (foldersFirst) {
          if (a.type === 'FOLDER' && b.type !== 'FOLDER') return -1;
          if (a.type !== 'FOLDER' && b.type === 'FOLDER') return 1;
        }

        let result = 0;

        switch (sortBy) {
          case 'name':
            result = a.name.localeCompare(b.name);
            break;
          case 'type':
            result = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
            break;
          case 'type-then-name':
            result = (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
            if (result === 0) {
              result = a.name.localeCompare(b.name);
            }
            break;
        }

        return descending ? -result : result;
      };

      const updatedElements = sortChildren(currentElements, parentId, compareFn, recursive);

      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      const sortDescription = `${sortBy}${descending ? ' (descending)' : ''}${foldersFirst ? ', folders first' : ''}`;

      return {
        content: [
          {
            type: 'text',
            text: `Sorted elements by ${sortDescription}${recursive ? ' (recursive)' : ''}`,
          },
        ],
        structuredContent: {
          success: true,
          sortBy,
          descending,
          foldersFirst,
          recursive,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error sorting elements', err);
      return {
        content: [{ type: 'text', text: `Error sorting elements: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// update_worldbuilding tool
// ============================================

registerTool({
  tool: {
    name: 'update_worldbuilding',
    title: 'Update Worldbuilding Data',
    description:
      'Update worldbuilding fields for a character, location, or other worldbuilding element',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'ID of the worldbuilding element to update',
        },
        fields: {
          type: 'object',
          description:
            'Key-value pairs of fields to update. Use field names directly without prefixes (e.g., "age", "occupation", not "worldbuilding.age"). Special identity fields: "description" and "image" are stored in a separate identity namespace.',
          additionalProperties: true,
        },
      },
      required: ['project', 'elementId', 'fields'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId);
    const fields = args.fields as Record<string, unknown> | undefined;

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (!fields || typeof fields !== 'object') {
      return {
        content: [{ type: 'text', text: 'Error: fields object is required' }],
        isError: true,
      };
    }

    try {
      // Special identity fields that go to the identity map
      const IDENTITY_FIELDS = ['description', 'image'];

      // Separate fields into identity and worldbuilding
      const identityUpdates: Record<string, unknown> = {};
      const worldbuildingUpdates: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(fields)) {
        if (key.startsWith('identity.')) {
          const identityKey = key.replace('identity.', '');
          identityUpdates[identityKey] = value;
        } else if (IDENTITY_FIELDS.includes(key)) {
          identityUpdates[key] = value;
        } else {
          worldbuildingUpdates[key] = value;
        }
      }

      // Apply updates using runtime-aware function
      if (Object.keys(identityUpdates).length > 0) {
        await updateWorldbuilding(ctx, username, slug, elementId, identityUpdates, 'identity');
      }

      // Apply worldbuilding map updates
      if (Object.keys(worldbuildingUpdates).length > 0) {
        await updateWorldbuilding(
          ctx,
          username,
          slug,
          elementId,
          worldbuildingUpdates,
          'worldbuilding'
        );
      }

      const updatedFields = Object.keys(fields);

      return {
        content: [
          {
            type: 'text',
            text: `Updated ${updatedFields.length} fields for element "${elementId}": ${updatedFields.join(', ')}`,
          },
        ],
        structuredContent: {
          success: true,
          elementId,
          updatedFields,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error updating worldbuilding', err);
      return {
        content: [{ type: 'text', text: `Error updating worldbuilding: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// create_relationship tool
// ============================================

registerTool({
  tool: {
    name: 'create_relationship',
    title: 'Create Relationship',
    description:
      'Create a relationship between two elements (e.g., character knows another character)',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        sourceId: {
          type: 'string',
          description: 'ID of the source element',
        },
        targetId: {
          type: 'string',
          description: 'ID of the target element',
        },
        type: {
          type: 'string',
          description: 'Relationship type (e.g., "knows", "parent-of", "located-in", "owns")',
        },
        details: {
          type: 'string',
          description: 'Optional details about the relationship',
        },
      },
      required: ['project', 'sourceId', 'targetId', 'type'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const sourceId = String(args.sourceId);
    const targetId = String(args.targetId);
    const type = String(args.type);
    const details = args.details ? String(args.details) : undefined;

    if (!sourceId || !targetId || !type) {
      return {
        content: [{ type: 'text', text: 'Error: sourceId, targetId, and type are required' }],
        isError: true,
      };
    }

    try {
      const now = new Date().toISOString();
      // Use the correct property names that match the frontend ElementRelationship interface
      const newRelationship: Relationship = {
        id: nanoid(),
        sourceElementId: sourceId,
        targetElementId: targetId,
        relationshipTypeId: type,
        note: details,
        createdAt: now,
        updatedAt: now,
      };

      await runtimeAddRelationship(ctx, username, slug, newRelationship);

      return {
        content: [
          {
            type: 'text',
            text: `Created "${type}" relationship from ${sourceId} to ${targetId}`,
          },
        ],
        structuredContent: {
          success: true,
          relationship: newRelationship,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error creating relationship', err);
      return {
        content: [{ type: 'text', text: `Error creating relationship: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// delete_relationship tool
// ============================================

registerTool({
  tool: {
    name: 'delete_relationship',
    title: 'Delete Relationship',
    description: 'Delete a relationship between elements',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        relationshipId: {
          type: 'string',
          description: 'ID of the relationship to delete',
        },
      },
      required: ['project', 'relationshipId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_WORLDBUILDING);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const relationshipId = String(args.relationshipId);

    if (!relationshipId) {
      return {
        content: [{ type: 'text', text: 'Error: relationshipId is required' }],
        isError: true,
      };
    }

    try {
      const relationships = await runtimeGetRelationships(ctx, username, slug);
      const index = relationships.findIndex((r) => r.id === relationshipId);

      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Error: relationship "${relationshipId}" not found` }],
          isError: true,
        };
      }

      // Remove the relationship from the array
      const updatedRelationships = [
        ...relationships.slice(0, index),
        ...relationships.slice(index + 1),
      ];
      await runtimeReplaceAllRelationships(ctx, username, slug, updatedRelationships);

      return {
        content: [
          {
            type: 'text',
            text: `Deleted relationship "${relationshipId}"`,
          },
        ],
        structuredContent: {
          success: true,
          deletedId: relationshipId,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error deleting relationship', err);
      return {
        content: [{ type: 'text', text: `Error deleting relationship: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// tag_element tool
// ============================================

registerTool({
  tool: {
    name: 'tag_element',
    title: 'Tag Element',
    description:
      'Add or remove tags on an element. Tags are stored in element metadata and can be used for filtering and organization.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'The ID of the element to tag',
        },
        action: {
          type: 'string',
          enum: ['add', 'remove', 'set'],
          description:
            'Action to perform: "add" to add tags, "remove" to remove tags, "set" to replace all tags',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add, remove, or set',
        },
      },
      required: ['project', 'elementId', 'action', 'tags'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = String(args.elementId ?? '');
    const action = String(args.action ?? 'add') as 'add' | 'remove' | 'set';
    const tags = (args.tags as string[]) ?? [];

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (!['add', 'remove', 'set'].includes(action)) {
      return {
        content: [{ type: 'text', text: 'Error: action must be "add", "remove", or "set"' }],
        isError: true,
      };
    }

    try {
      const elements = await runtimeGetElements(ctx, username, slug);
      const index = elements.findIndex((e) => e.id === elementId);

      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
          isError: true,
        };
      }

      const element = elements[index];
      // Tags are stored as JSON string in metadata since metadata is Record<string, string>
      let currentTags: string[] = [];
      try {
        currentTags = element.metadata?.tags ? JSON.parse(element.metadata.tags) : [];
      } catch {
        currentTags = [];
      }

      let newTags: string[];
      switch (action) {
        case 'add':
          newTags = [...new Set([...currentTags, ...tags])];
          break;
        case 'remove':
          newTags = currentTags.filter((t) => !tags.includes(t));
          break;
        case 'set':
          newTags = [...new Set(tags)];
          break;
      }

      // Update element with new tags (stored as JSON string)
      const updatedElements = [...elements];
      updatedElements[index] = {
        ...element,
        metadata: {
          ...element.metadata,
          tags: JSON.stringify(newTags),
        },
      };

      await runtimeReplaceAllElements(ctx, username, slug, updatedElements);

      return {
        content: [
          {
            type: 'text',
            text: `Updated tags for "${element.name}": ${newTags.length > 0 ? newTags.join(', ') : '(no tags)'}`,
          },
        ],
        structuredContent: {
          success: true,
          elementId,
          elementName: element.name,
          previousTags: currentTags,
          newTags,
        },
      };
    } catch (err) {
      mcpMutLog.error('Error updating element tags', err);
      return {
        content: [{ type: 'text', text: `Error updating tags: ${err}` }],
        isError: true,
      };
    }
  },
});

// ============================================
// create_snapshot tool
// ============================================

registerTool({
  tool: {
    name: 'create_snapshot',
    title: 'Create Snapshot',
    description:
      'Create a snapshot of a document to save its current state. Snapshots can be used to restore content or compare versions.',
    inputSchema: {
      type: 'object',
      properties: {
        project: projectPropertySchema,
        elementId: {
          type: 'string',
          description: 'The ID of the document element to snapshot',
        },
        name: {
          type: 'string',
          description: 'Name for the snapshot',
        },
        description: {
          type: 'string',
          description: 'Optional description of why this snapshot was created',
        },
      },
      required: ['project', 'elementId', 'name'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    const elementId = String(args.elementId ?? '');
    const name = String(args.name ?? '');
    const description = args.description ? String(args.description) : undefined;

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    if (!name) {
      return {
        content: [{ type: 'text', text: 'Error: name is required' }],
        isError: true,
      };
    }

    try {
      // Get element to verify it exists
      const elements = await runtimeGetElements(ctx, username, slug);
      const element = elements.find((e) => e.id === elementId);

      if (!element) {
        return {
          content: [{ type: 'text', text: `Error: element "${elementId}" not found` }],
          isError: true,
        };
      }

      // Get document content - we need to read ProseMirror content
      // This requires runtime-specific handling
      let xmlContent = '';
      let wordCount = 0;
      let worldbuildingData: Record<string, unknown> | null = null;

      if (isCloudflareWorkers(ctx)) {
        // Cloudflare Workers: use getWorldbuildingDoc which can read document content
        try {
          const wbDoc = await getWorldbuildingDoc(ctx, username, slug, elementId);
          const docData = wbDoc.toJSON();

          // For now, we can't easily get ProseMirror XML on Workers
          // since it requires XmlFragment parsing. Store empty for Workers.
          xmlContent = '';
          wordCount = 0;

          // Get worldbuilding data if applicable
          if (element.type === 'WORLDBUILDING' && Object.keys(docData).length > 0) {
            worldbuildingData = docData;
          }
        } catch (err: unknown) {
          mcpMutLog.warn('Could not get document content for snapshot', { error: String(err) });
        }
      } else {
        // Bun: use LevelDB service for full access
        try {
          const { yjsService } = await import('../../services/yjs.service');
          const docContentId = `${username}:${slug}:${elementId}/`;
          const contentDoc = await yjsService.getDocument(docContentId);

          // Get ProseMirror content
          const xmlFragment = contentDoc.doc.getXmlFragment('prosemirror');
          xmlContent = xmlFragment.toString();

          // Count words
          const textContent = extractTextContent(xmlFragment);
          wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length;

          // Get worldbuilding data if applicable
          if (element.type === 'WORLDBUILDING') {
            const dataMap = contentDoc.doc.getMap('worldbuilding');
            const data: Record<string, unknown> = {};
            dataMap.forEach((value, key) => {
              data[key] = value;
            });
            if (Object.keys(data).length > 0) {
              worldbuildingData = data;
            }
          }
        } catch (err: unknown) {
          mcpMutLog.warn('Could not get document content for snapshot', { error: String(err) });
        }
      }

      // Create snapshot in database
      // Import dynamically to avoid circular dependency
      const { documentSnapshotService } = await import('../../services/document-snapshot.service');

      // Get userId from context (only available for OAuth auth)
      const userId = ctx.type === 'oauth' ? ctx.userId : 'mcp-api-key';

      const snapshot = await documentSnapshotService.create(
        db as Parameters<typeof documentSnapshotService.create>[0],
        {
          documentId: elementId,
          projectId,
          userId,
          name,
          description,
          xmlContent,
          worldbuildingData: worldbuildingData ?? undefined,
          wordCount,
          metadata: {
            createdBy: 'mcp',
            elementName: element.name,
            elementType: element.type,
          },
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: `Created snapshot "${name}" for "${element.name}" (${wordCount} words)`,
          },
        ],
        structuredContent: {
          success: true,
          snapshotId: snapshot.id,
          elementId,
          elementName: element.name,
          wordCount,
          createdAt: new Date(snapshot.createdAt).toISOString(),
        },
      };
    } catch (err) {
      mcpMutLog.error('Error creating snapshot', err);
      return {
        content: [{ type: 'text', text: `Error creating snapshot: ${err}` }],
        isError: true,
      };
    }
  },
});

/**
 * Extract plain text from a Yjs XmlFragment
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextContent(fragment: any): string {
  const parts: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function traverse(node: any) {
    if (!node) return;
    if (typeof node.toString === 'function') {
      const text = node.toString();
      if (text && !text.startsWith('<')) {
        parts.push(text);
      }
    }
    if (typeof node.toArray === 'function') {
      for (const child of node.toArray()) {
        traverse(child);
      }
    }
  }

  traverse(fragment);
  return parts.join(' ').trim();
}

export {};
