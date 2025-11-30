import { Injectable } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';

/**
 * Represents the valid drop levels for a drag-and-drop operation
 */
export interface ValidDropLevels {
  /** Array of valid level numbers where the item can be dropped */
  levels: number[];
  /** The default level to use if no specific level is selected */
  defaultLevel: number;
}

/**
 * Stateless service for tree manipulation operations on project elements.
 *
 * This service contains pure functions that operate on element arrays without
 * any internal state. It handles:
 * - Validating drop operations in the tree
 * - Computing valid drop levels
 * - Calculating insertion indices
 * - Extracting subtrees
 * - Recomputing element positions
 *
 * @example
 * ```typescript
 * const treeService = inject(ElementTreeService);
 * const validLevels = treeService.getValidDropLevels(nodeAbove, nodeBelow);
 * if (treeService.isValidDrop(nodeAbove, targetLevel)) {
 *   const insertIndex = treeService.getDropInsertIndex(elements, nodeAbove, targetLevel);
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class ElementTreeService {
  /**
   * Validates whether a drop operation is allowed at the specified level.
   *
   * Rules:
   * - Items (non-folders) cannot have children
   * - Folders can only have children one level deeper
   * - No negative levels allowed
   * - If no node above, only root level (0) or first level (1) allowed
   *
   * @param nodeAbove - The element immediately above the drop position, or null if dropping at the top
   * @param targetLevel - The indentation level where the user wants to drop
   * @returns true if the drop is valid, false otherwise
   */
  isValidDrop(nodeAbove: Element | null, targetLevel: number): boolean {
    // Prevent negative levels first
    if (targetLevel < 0) {
      return false;
    }

    if (!nodeAbove) {
      // If no node above, only allow root level or first level
      return targetLevel <= 1;
    }

    // Items can't have children
    if (nodeAbove.type === ElementType.Item && targetLevel > nodeAbove.level) {
      return false;
    }

    // Folders can only have children one level deeper
    if (
      nodeAbove.type === ElementType.Folder &&
      targetLevel > nodeAbove.level + 1
    ) {
      return false;
    }

    return true;
  }

  /**
   * Calculates the valid drop levels based on surrounding nodes.
   *
   * This determines which indentation levels are valid for dropping an item
   * between two existing nodes (or at the boundaries of the tree).
   *
   * @param nodeAbove - The element above the drop position, or null if at the top
   * @param nodeBelow - The element below the drop position, or null if at the bottom
   * @returns Object containing array of valid levels and the default level
   */
  getValidDropLevels(
    nodeAbove: Element | null,
    nodeBelow: Element | null
  ): ValidDropLevels {
    const validLevels = new Set<number>();

    if (nodeAbove && nodeBelow) {
      if (nodeAbove.level < nodeBelow.level) {
        if (nodeAbove.type === ElementType.Folder) {
          if (nodeBelow.level === nodeAbove.level + 1) {
            validLevels.add(nodeBelow.level);
          } else {
            validLevels.add(nodeAbove.level);
            validLevels.add(nodeAbove.level + 1);
          }
        } else {
          validLevels.add(nodeBelow.level);
        }
      } else if (nodeAbove.level === nodeBelow.level) {
        validLevels.add(nodeAbove.level);
        // Also allow dropping inside if above node is a folder
        if (nodeAbove.type === ElementType.Folder) {
          validLevels.add(nodeAbove.level + 1);
        }
      } else {
        // Allow all levels between the two nodes
        for (let level = nodeBelow.level; level <= nodeAbove.level; level++) {
          validLevels.add(level);
        }
      }
    } else if (nodeAbove && !nodeBelow) {
      // Allow current level and all levels above it
      for (let level = 0; level <= nodeAbove.level; level++) {
        validLevels.add(level);
      }
      // If above node is a folder, allow one level deeper
      if (nodeAbove.type === ElementType.Folder) {
        validLevels.add(nodeAbove.level + 1);
      }
    } else if (!nodeAbove && nodeBelow) {
      validLevels.add(nodeBelow.level);
    } else {
      validLevels.add(0); // Root level only if no context
    }

    const levels = Array.from(validLevels).sort((a, b) => a - b);
    const defaultLevel = levels.length > 0 ? levels[0] : 0;

    return {
      levels,
      defaultLevel,
    };
  }

  /**
   * Calculates the insertion index for a drop operation.
   *
   * When dropping at a deeper level than the node above, inserts right after it.
   * When dropping at the same or higher level, inserts after the entire subtree.
   *
   * @param elements - The current array of elements
   * @param nodeAbove - The element above the drop position, or null if dropping at top
   * @param targetLevel - The level at which the item is being dropped
   * @returns The index where the new element should be inserted
   */
  getDropInsertIndex(
    elements: Element[],
    nodeAbove: Element | null,
    targetLevel: number
  ): number {
    if (!nodeAbove) {
      return 0;
    }

    const nodeAboveIndex = elements.findIndex(n => n.id === nodeAbove.id);
    if (nodeAboveIndex === -1) {
      return elements.length;
    }

    // If dropping at a deeper level than the node above, insert right after it
    if (targetLevel > nodeAbove.level) {
      return nodeAboveIndex + 1;
    }

    // If dropping at the same or higher level, insert after the entire subtree
    const subtree = this.getSubtree(elements, nodeAboveIndex);
    return nodeAboveIndex + subtree.length;
  }

  /**
   * Extracts a subtree starting from a given index.
   *
   * A subtree includes the starting element and all subsequent elements
   * that have a deeper level (are nested under the starting element).
   *
   * @param elements - The array of elements
   * @param startIndex - The index of the root of the subtree
   * @returns Array of elements in the subtree (including the root)
   */
  getSubtree(elements: Element[], startIndex: number): Element[] {
    if (startIndex < 0 || startIndex >= elements.length) {
      return [];
    }

    const startLevel = elements[startIndex].level;
    const subtree = [elements[startIndex]];

    for (let i = startIndex + 1; i < elements.length; i++) {
      if (elements[i].level > startLevel) {
        subtree.push(elements[i]);
      } else {
        break;
      }
    }

    return subtree;
  }

  /**
   * Recomputes the order property for all elements based on their array index.
   *
   * This should be called after any operation that changes element order
   * to ensure order values are consistent with array indices.
   *
   * @param elements - The array of elements to reorder
   * @returns A new array with updated order values
   */
  recomputeOrder(elements: Element[]): Element[] {
    return elements.map((element, index) => ({
      ...element,
      order: index,
    }));
  }

  /**
   * Moves an element (and its subtree) to a new position and level.
   *
   * This is a pure function that returns a new array with the element moved.
   * It does not modify the input array.
   *
   * @param elements - The current array of elements
   * @param elementId - The ID of the element to move
   * @param targetIndex - The target index for the element
   * @param newLevel - The new level for the element
   * @returns A new array with the element moved, or the original array if element not found
   */
  moveElement(
    elements: Element[],
    elementId: string,
    targetIndex: number,
    newLevel: number
  ): Element[] {
    const elementIndex = elements.findIndex(e => e.id === elementId);
    if (elementIndex === -1) {
      return elements;
    }

    const element = elements[elementIndex];
    const subtree = this.getSubtree(elements, elementIndex);
    const levelDiff = newLevel - element.level;

    // Remove subtree from current position
    const newElements = elements.filter(e => !subtree.includes(e));

    // Update levels in subtree (create new objects to avoid mutation)
    const updatedSubtree = subtree.map(e => ({
      ...e,
      level: e.level + levelDiff,
    }));

    // Adjust target index if we're moving forward (account for removed elements)
    let adjustedTargetIndex = targetIndex;
    if (targetIndex > elementIndex) {
      adjustedTargetIndex -= subtree.length;
    }

    // Ensure target index is within bounds
    adjustedTargetIndex = Math.max(
      0,
      Math.min(adjustedTargetIndex, newElements.length)
    );

    // Insert at new position
    newElements.splice(adjustedTargetIndex, 0, ...updatedSubtree);

    return this.recomputeOrder(newElements);
  }

  /**
   * Finds the parent element for an element at a given index.
   *
   * The parent is the closest preceding element with a level exactly one less
   * than the current element's level.
   *
   * @param elements - The array of elements
   * @param index - The index of the element to find the parent for
   * @returns The parent element, or null if the element is at root level
   */
  findParent(elements: Element[], index: number): Element | null {
    if (index < 0 || index >= elements.length) {
      return null;
    }

    const element = elements[index];
    if (element.level === 0) {
      return null;
    }

    // Search backwards for the parent (first element with level = element.level - 1)
    for (let i = index - 1; i >= 0; i--) {
      if (elements[i].level === element.level - 1) {
        return elements[i];
      }
    }

    return null;
  }

  /**
   * Gets all ancestor elements for an element at a given index.
   *
   * @param elements - The array of elements
   * @param index - The index of the element to find ancestors for
   * @returns Array of ancestor elements, from immediate parent to root
   */
  getAncestors(elements: Element[], index: number): Element[] {
    const ancestors: Element[] = [];
    let currentIndex = index;

    while (currentIndex >= 0) {
      const parent = this.findParent(elements, currentIndex);
      if (parent) {
        ancestors.push(parent);
        currentIndex = elements.findIndex(e => e.id === parent.id);
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Checks if an element is a descendant of another element.
   *
   * @param elements - The array of elements
   * @param potentialDescendantId - The ID of the potential descendant
   * @param potentialAncestorId - The ID of the potential ancestor
   * @returns true if potentialDescendant is a descendant of potentialAncestor
   */
  isDescendantOf(
    elements: Element[],
    potentialDescendantId: string,
    potentialAncestorId: string
  ): boolean {
    const descendantIndex = elements.findIndex(
      e => e.id === potentialDescendantId
    );
    if (descendantIndex === -1) {
      return false;
    }

    const ancestors = this.getAncestors(elements, descendantIndex);
    return ancestors.some(a => a.id === potentialAncestorId);
  }
}
