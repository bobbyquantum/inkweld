/**
 * MCP Tools: Mutation Operations
 *
 * Tools for creating, updating, and deleting elements and worldbuilding data.
 * Changes sync in real-time to all connected clients via Yjs.
 *
 * IMPORTANT: Inkweld uses a **positional hierarchy** model:
 * - Elements are stored in a flat array
 * - Parent-child relationships are determined by ARRAY POSITION + LEVEL
 * - Children must IMMEDIATELY FOLLOW their parent in the array
 * - A child's level must be exactly parent.level + 1
 *
 * This file uses helper functions from tree-helpers.ts to maintain this structure.
 */

import { nanoid } from 'nanoid';
import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult } from '../mcp.types';
import { MCP_PERMISSIONS } from '../../db/schema/mcp-access-keys';
import { yjsService } from '../../services/yjs.service';
import { Element, ElementType, ELEMENT_TYPES } from '../../schemas/element.schemas';
import {
  getElementsDocId,
  getWorldbuildingDocId,
  insertElement,
  removeElement,
  moveElement,
  sortChildren,
  normalizeElements,
  getSubtree,
  findParentByPosition,
} from './tree-helpers';

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
      required: ['name', 'type'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      const currentElements = elementsArray.toJSON() as Element[];

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
      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, updatedElements);
      });

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
      console.error('Error creating element:', err);
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
      required: ['elements'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');

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
      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, newElements);
      });

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
      console.error('Error replacing elements:', err);
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
      required: ['elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      const currentElements = elementsArray.toJSON() as Element[];

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

      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, updatedElements);
      });

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
      console.error('Error updating element:', err);
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
        elementId: {
          type: 'string',
          description: 'ID of the element to delete',
        },
      },
      required: ['elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const elementId = String(args.elementId);

    if (!elementId) {
      return {
        content: [{ type: 'text', text: 'Error: elementId is required' }],
        isError: true,
      };
    }

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      const currentElements = elementsArray.toJSON() as Element[];

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

      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, updatedElements);
      });

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
      console.error('Error deleting element:', err);
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
      required: ['elementIds'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      let currentElements = elementsArray.toJSON() as Element[];

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

      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, currentElements);
      });

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
      console.error('Error moving elements:', err);
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
      required: ['elementId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      const currentElements = elementsArray.toJSON() as Element[];

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

      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, updatedElements);
      });

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
      console.error('Error reordering element:', err);
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
      required: [],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const parentId =
      args.parentId === '' || args.parentId === null || args.parentId === undefined
        ? null
        : String(args.parentId);
    const sortBy = (args.sortBy as string) || 'name';
    const descending = Boolean(args.descending);
    const foldersFirst = args.foldersFirst !== false; // Default true
    const recursive = Boolean(args.recursive);

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const elementsArray = sharedDoc.doc.getArray('elements');
      const currentElements = elementsArray.toJSON() as Element[];

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

      sharedDoc.doc.transact(() => {
        elementsArray.delete(0, elementsArray.length);
        elementsArray.insert(0, updatedElements);
      });

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
      console.error('Error sorting elements:', err);
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
        elementId: {
          type: 'string',
          description: 'ID of the worldbuilding element to update',
        },
        fields: {
          type: 'object',
          description:
            'Key-value pairs of fields to update. Special fields: "description" and "image" are stored separately. Schema fields depend on element type.',
          additionalProperties: true,
        },
      },
      required: ['elementId', 'fields'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const wbDocId = getWorldbuildingDocId(username, slug, elementId);

    try {
      const sharedDoc = await yjsService.getDocument(wbDocId);
      const worldbuildingMap = sharedDoc.doc.getMap('worldbuilding');
      const identityMap = sharedDoc.doc.getMap('identity');

      const updatedFields: string[] = [];

      // Special identity fields that go to the identity map
      const IDENTITY_FIELDS = ['description', 'image'];

      sharedDoc.doc.transact(() => {
        for (const [key, value] of Object.entries(fields)) {
          if (key.startsWith('identity.')) {
            const identityKey = key.replace('identity.', '');
            identityMap.set(identityKey, value);
            updatedFields.push(key);
          } else if (IDENTITY_FIELDS.includes(key)) {
            identityMap.set(key, value);
            updatedFields.push(key);
          } else {
            worldbuildingMap.set(key, value);
            updatedFields.push(key);
          }
        }
      });

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
      console.error('Error updating worldbuilding:', err);
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
      required: ['sourceId', 'targetId', 'type'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
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

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const relationshipsArray = sharedDoc.doc.getArray('relationships');

      const now = new Date().toISOString();
      // Use the correct property names that match the frontend ElementRelationship interface
      const newRelationship = {
        id: nanoid(),
        sourceElementId: sourceId,
        targetElementId: targetId,
        relationshipTypeId: type,
        note: details,
        createdAt: now,
        updatedAt: now,
      };

      sharedDoc.doc.transact(() => {
        relationshipsArray.push([newRelationship]);
      });

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
      console.error('Error creating relationship:', err);
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
        relationshipId: {
          type: 'string',
          description: 'ID of the relationship to delete',
        },
      },
      required: ['relationshipId'],
    },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_WORLDBUILDING],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const relationshipId = String(args.relationshipId);

    if (!relationshipId) {
      return {
        content: [{ type: 'text', text: 'Error: relationshipId is required' }],
        isError: true,
      };
    }

    const { username, slug } = ctx;
    const docId = getElementsDocId(username, slug);

    try {
      const sharedDoc = await yjsService.getDocument(docId);
      const relationshipsArray = sharedDoc.doc.getArray('relationships');

      const relationships = relationshipsArray.toJSON() as Array<{ id: string }>;
      const index = relationships.findIndex((r) => r.id === relationshipId);

      if (index === -1) {
        return {
          content: [{ type: 'text', text: `Error: relationship "${relationshipId}" not found` }],
          isError: true,
        };
      }

      sharedDoc.doc.transact(() => {
        relationshipsArray.delete(index, 1);
      });

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
      console.error('Error deleting relationship:', err);
      return {
        content: [{ type: 'text', text: `Error deleting relationship: ${err}` }],
        isError: true,
      };
    }
  },
});

export {};
