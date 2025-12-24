/**
 * Tree Helper Functions for MCP Tools
 *
 * The Inkweld frontend uses a **positional hierarchy** model:
 * - Elements are stored in a flat array
 * - Parent-child relationships are determined by ARRAY POSITION + LEVEL
 * - A child is any element that:
 *   1. Comes AFTER its parent in the array
 *   2. Has a level exactly ONE greater than the parent
 *   3. Continues until an element with level <= parent level is found
 *
 * Example:
 *   Index 0: Characters (level 0)     ← Parent
 *   Index 1: Elena (level 1)          ← Child of Characters
 *   Index 2: Marcus (level 1)         ← Child of Characters
 *   Index 3: Locations (level 0)      ← New root element (ends Characters subtree)
 *   Index 4: Tavern (level 1)         ← Child of Locations
 *
 * The `parentId` field is stored for convenience but the frontend
 * IGNORES it and uses positional lookup instead.
 */

import { nanoid } from 'nanoid';
import { Element, ElementType } from '../../schemas/element.schemas';

/**
 * Get the Yjs document ID for a project's elements array.
 * Note: The trailing '/' is required because y-websocket appends it to the room URL.
 */
export function getElementsDocId(username: string, slug: string): string {
  return `${username}:${slug}:elements/`;
}

/**
 * Get the Yjs document ID for an element's worldbuilding data.
 */
export function getWorldbuildingDocId(username: string, slug: string, elementId: string): string {
  return `${username}:${slug}:${elementId}/`;
}

/**
 * Find the parent of an element using positional hierarchy.
 * The parent is the closest PRECEDING element with level = element.level - 1
 */
export function findParentByPosition(elements: Element[], index: number): Element | null {
  if (index < 0 || index >= elements.length) return null;

  const element = elements[index];
  if (element.level === 0) return null;

  // Search backwards for parent (first element with level - 1)
  for (let i = index - 1; i >= 0; i--) {
    if (elements[i].level === element.level - 1) {
      return elements[i];
    }
  }

  return null;
}

/**
 * Get the subtree starting at a given index.
 * Returns the element and all its positional descendants.
 */
export function getSubtree(elements: Element[], startIndex: number): Element[] {
  if (startIndex < 0 || startIndex >= elements.length) return [];

  const startLevel = elements[startIndex].level;
  const subtree = [elements[startIndex]];

  for (let i = startIndex + 1; i < elements.length; i++) {
    if (elements[i].level > startLevel) {
      subtree.push(elements[i]);
    } else {
      break; // Hit an element at same or lower level - end of subtree
    }
  }

  return subtree;
}

/**
 * Get direct children of an element (elements at level + 1 immediately following).
 */
export function getDirectChildren(elements: Element[], parentIndex: number): Element[] {
  if (parentIndex < 0 || parentIndex >= elements.length) return [];

  const parent = elements[parentIndex];
  const childLevel = parent.level + 1;
  const children: Element[] = [];

  for (let i = parentIndex + 1; i < elements.length; i++) {
    const el = elements[i];
    if (el.level <= parent.level) break; // End of subtree
    if (el.level === childLevel) {
      children.push(el);
    }
  }

  return children;
}

/**
 * Find the end of a subtree (the index after the last descendant).
 */
export function getSubtreeEndIndex(elements: Element[], startIndex: number): number {
  if (startIndex < 0 || startIndex >= elements.length) return startIndex;

  const startLevel = elements[startIndex].level;

  for (let i = startIndex + 1; i < elements.length; i++) {
    if (elements[i].level <= startLevel) {
      return i;
    }
  }

  return elements.length;
}

/**
 * Create a new element with proper defaults.
 */
export function createElement(
  name: string,
  type: ElementType,
  level: number,
  parentId: string | null = null
): Element {
  return {
    id: nanoid(),
    name,
    type,
    parentId,
    level,
    expandable: type === 'FOLDER',
    order: 0, // Will be set correctly when inserted
    version: 0,
    metadata: {},
  };
}

/**
 * Recompute order values based on array position.
 * Also updates parentId to match positional hierarchy.
 */
export function normalizeElements(elements: Element[]): Element[] {
  return elements.map((el, index) => {
    const parent = findParentByPosition(elements, index);
    return {
      ...el,
      order: index,
      parentId: parent?.id ?? null,
    };
  });
}

/**
 * Insert an element into the tree at the correct position.
 *
 * @param elements Current elements array
 * @param newElement Element to insert (level and parentId will be set)
 * @param parentId Parent to insert under (null for root)
 * @param afterSiblingId Optional: insert after this sibling
 * @returns New elements array with the element inserted
 */
export function insertElement(
  elements: Element[],
  newElement: Element,
  parentId: string | null,
  afterSiblingId?: string
): Element[] {
  const result = [...elements];

  // Determine level and insertion index
  let insertIndex: number;
  let level: number;

  if (parentId === null) {
    // Insert at root level
    level = 0;

    if (afterSiblingId) {
      // Find the sibling and insert after its subtree
      const siblingIndex = result.findIndex((e) => e.id === afterSiblingId);
      if (siblingIndex !== -1) {
        insertIndex = getSubtreeEndIndex(result, siblingIndex);
      } else {
        insertIndex = result.length; // Fallback: append
      }
    } else {
      // Insert at the end of root elements
      insertIndex = result.length;
    }
  } else {
    // Find parent
    const parentIndex = result.findIndex((e) => e.id === parentId);
    if (parentIndex === -1) {
      throw new Error(`Parent element "${parentId}" not found`);
    }

    const parent = result[parentIndex];
    level = parent.level + 1;

    if (afterSiblingId) {
      // Insert after specific sibling
      const siblingIndex = result.findIndex((e) => e.id === afterSiblingId);
      if (siblingIndex !== -1 && siblingIndex > parentIndex) {
        insertIndex = getSubtreeEndIndex(result, siblingIndex);
      } else {
        // Sibling not found or not under this parent - insert at end of parent's children
        insertIndex = getSubtreeEndIndex(result, parentIndex);
      }
    } else {
      // Insert at the end of parent's subtree
      insertIndex = getSubtreeEndIndex(result, parentIndex);
    }
  }

  // Create the element with correct properties
  const elementToInsert: Element = {
    ...newElement,
    level,
    parentId,
    order: insertIndex,
  };

  // Insert into array
  result.splice(insertIndex, 0, elementToInsert);

  // Normalize orders
  return normalizeElements(result);
}

/**
 * Remove an element and all its descendants from the tree.
 *
 * @returns New elements array without the element and its subtree
 */
export function removeElement(elements: Element[], elementId: string): Element[] {
  const index = elements.findIndex((e) => e.id === elementId);
  if (index === -1) return elements;

  const subtree = getSubtree(elements, index);
  const result = elements.filter((e) => !subtree.includes(e));

  return normalizeElements(result);
}

/**
 * Move an element (and its subtree) to a new parent.
 *
 * @param elements Current elements array
 * @param elementId Element to move
 * @param newParentId New parent (null for root)
 * @param afterSiblingId Optional: position after this sibling
 * @returns New elements array with element moved
 */
export function moveElement(
  elements: Element[],
  elementId: string,
  newParentId: string | null,
  afterSiblingId?: string
): Element[] {
  const elementIndex = elements.findIndex((e) => e.id === elementId);
  if (elementIndex === -1) {
    throw new Error(`Element "${elementId}" not found`);
  }

  // Prevent moving to self or own descendant
  if (newParentId) {
    const subtree = getSubtree(elements, elementIndex);
    if (subtree.some((e) => e.id === newParentId)) {
      throw new Error('Cannot move element into its own subtree');
    }
  }

  // Extract the subtree
  const subtree = getSubtree(elements, elementIndex);

  // Calculate level delta
  const oldLevel = elements[elementIndex].level;
  let newLevel: number;

  if (newParentId === null) {
    newLevel = 0;
  } else {
    const parentIndex = elements.findIndex((e) => e.id === newParentId);
    if (parentIndex === -1) {
      throw new Error(`New parent "${newParentId}" not found`);
    }
    newLevel = elements[parentIndex].level + 1;
  }

  const levelDelta = newLevel - oldLevel;

  // Adjust levels in subtree
  const adjustedSubtree = subtree.map((e) => ({
    ...e,
    level: e.level + levelDelta,
  }));

  // Update the root element's parentId
  adjustedSubtree[0] = {
    ...adjustedSubtree[0],
    parentId: newParentId,
  };

  // Remove subtree from original position
  const withoutSubtree = elements.filter((e) => !subtree.includes(e));

  // Find insertion point
  let insertIndex: number;

  if (newParentId === null) {
    if (afterSiblingId) {
      const siblingIndex = withoutSubtree.findIndex((e) => e.id === afterSiblingId);
      if (siblingIndex !== -1) {
        insertIndex = getSubtreeEndIndex(withoutSubtree, siblingIndex);
      } else {
        insertIndex = withoutSubtree.length;
      }
    } else {
      insertIndex = withoutSubtree.length;
    }
  } else {
    const parentIndex = withoutSubtree.findIndex((e) => e.id === newParentId);
    if (parentIndex === -1) {
      throw new Error(`New parent "${newParentId}" not found after subtree removal`);
    }

    if (afterSiblingId) {
      const siblingIndex = withoutSubtree.findIndex((e) => e.id === afterSiblingId);
      if (siblingIndex !== -1 && siblingIndex > parentIndex) {
        insertIndex = getSubtreeEndIndex(withoutSubtree, siblingIndex);
      } else {
        insertIndex = getSubtreeEndIndex(withoutSubtree, parentIndex);
      }
    } else {
      insertIndex = getSubtreeEndIndex(withoutSubtree, parentIndex);
    }
  }

  // Insert adjusted subtree
  const result = [
    ...withoutSubtree.slice(0, insertIndex),
    ...adjustedSubtree,
    ...withoutSubtree.slice(insertIndex),
  ];

  return normalizeElements(result);
}

/**
 * Sort children of a folder.
 *
 * @param elements Current elements array
 * @param parentId Parent folder to sort children of (null for root)
 * @param compareFn Comparison function for sorting
 * @param recursive Whether to sort recursively
 * @returns New sorted elements array
 */
export function sortChildren(
  elements: Element[],
  parentId: string | null,
  compareFn: (a: Element, b: Element) => number,
  recursive: boolean = false
): Element[] {
  // Build tree structure for this operation
  interface TreeNode {
    element: Element;
    children: TreeNode[];
  }

  function buildTree(pId: string | null): TreeNode[] {
    const children: TreeNode[] = [];
    let i = 0;

    while (i < elements.length) {
      const el = elements[i];

      // Find elements at the right level whose positional parent matches
      const positionalParent = findParentByPosition(elements, i);
      const positionalParentId = positionalParent?.id ?? null;

      if (positionalParentId === pId) {
        const subtree = getSubtree(elements, i);
        children.push({
          element: el,
          children: buildTree(el.id),
        });
        // Skip past this subtree
        i += subtree.length;
      } else {
        i++;
      }
    }

    return children;
  }

  function flattenTree(nodes: TreeNode[], level: number, parentIdVal: string | null): Element[] {
    const result: Element[] = [];

    // Sort the nodes
    const sorted = [...nodes].sort((a, b) => compareFn(a.element, b.element));

    for (const node of sorted) {
      result.push({
        ...node.element,
        level,
        parentId: parentIdVal,
      });

      // Always include children, but only sort them if recursive=true
      if (node.children.length > 0) {
        if (recursive) {
          // Sort children too
          result.push(...flattenTree(node.children, level + 1, node.element.id));
        } else {
          // Keep children in original order
          result.push(...flattenChildren(node.children, level + 1, node.element.id));
        }
      }
    }

    return result;
  }

  function flattenChildren(
    nodes: TreeNode[],
    level: number,
    parentIdVal: string | null
  ): Element[] {
    // Flatten without sorting (preserve original order within children)
    const result: Element[] = [];

    for (const node of nodes) {
      result.push({
        ...node.element,
        level,
        parentId: parentIdVal,
      });

      if (node.children.length > 0) {
        result.push(...flattenChildren(node.children, level + 1, node.element.id));
      }
    }

    return result;
  }

  // Build and flatten the tree, sorting at the specified level
  const tree = buildTree(parentId);
  const parentElement = parentId ? elements.find((e) => e.id === parentId) : null;
  const startLevel = parentElement ? parentElement.level + 1 : 0;
  const flattened = flattenTree(tree, startLevel, parentId);

  // If we're sorting root, that's the whole tree
  // If we're sorting a subfolder, we need to splice it back in
  if (parentId === null) {
    return normalizeElements(flattened);
  }

  // Find parent and replace its children
  const parentIndex = elements.findIndex((e) => e.id === parentId);
  if (parentIndex === -1) return elements;

  const endIndex = getSubtreeEndIndex(elements, parentIndex);
  const before = elements.slice(0, parentIndex + 1); // Include parent
  const after = elements.slice(endIndex);

  return normalizeElements([...before, ...flattened, ...after]);
}

/**
 * Build a visual tree representation for display.
 */
export interface TreeNode {
  id: string;
  name: string;
  type: string;
  level: number;
  order: number;
  children: TreeNode[];
}

export function buildVisualTree(elements: Element[]): TreeNode[] {
  const result: TreeNode[] = [];
  const stack: { node: TreeNode; level: number }[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    const node: TreeNode = {
      id: el.id,
      name: el.name,
      type: el.type,
      level: el.level,
      order: el.order,
      children: [],
    };

    // Pop from stack until we find the parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= el.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Root level
      result.push(node);
    } else {
      // Add as child of current stack top
      stack[stack.length - 1].node.children.push(node);
    }

    // Push this node onto stack if it could have children
    if (el.expandable || el.type === 'FOLDER') {
      stack.push({ node, level: el.level });
    }
  }

  return result;
}

/**
 * Generate a text representation of the tree.
 */
export function treeToText(elements: Element[]): string {
  const tree = buildVisualTree(elements);

  function renderNodes(nodes: TreeNode[], indent: string = ''): string {
    let text = '';

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const prefix = isLast ? '└── ' : '├── ';

      const typeIcon =
        node.type === 'FOLDER'
          ? '📁'
          : node.type === 'ITEM'
            ? '📄'
            : node.type === 'WORLDBUILDING'
              ? '📦'
              : '📋';

      text += `${indent}${prefix}${typeIcon} ${node.name} (${node.id})\n`;

      if (node.children.length > 0) {
        const childIndent = indent + (isLast ? '    ' : '│   ');
        text += renderNodes(node.children, childIndent);
      }
    }

    return text;
  }

  return renderNodes(tree);
}
