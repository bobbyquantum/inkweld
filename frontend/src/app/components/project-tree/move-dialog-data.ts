import { type MoveElementDialogData } from '../../dialogs/move-element-dialog/move-element-dialog.component';
import { type ProjectElement } from '../../models/project-element';

/** Minimal shape of a tree node needed to describe a drop position. */
export type DropNode = Pick<
  ProjectElement,
  'id' | 'name' | 'level' | 'expandable'
>;

export interface MoveDialogContext {
  /** The item being moved. */
  node: Pick<ProjectElement, 'id' | 'name'>;
  /** Visible tree rows in display order (carrying `level`/`expandable`). */
  treeNodes: readonly DropNode[];
  /** Every element, used to walk parent links for breadcrumb paths. */
  elements: readonly Pick<ProjectElement, 'id' | 'name' | 'parentId'>[];
  /** The row the item is dropped below, or null for the top of the tree. */
  nodeAbove: DropNode | null;
  /** The level the item will land at. */
  dropLevel: number;
  projectName: string;
  untitledName: string;
  /** Translate a `dialogs.move.*` key. */
  translate: (key: string, params?: Record<string, string>) => string;
}

/**
 * The folder a drop at `dropLevel` below `nodeAbove` lands in, or null for the
 * project root. Mirrors the tree's parent-highlight logic so the dialog names
 * the same folder the move actually uses.
 */
export function findDropParentFolderId(
  treeNodes: readonly DropNode[],
  nodeAbove: DropNode | null,
  dropLevel: number
): string | null {
  if (!nodeAbove || dropLevel === 0) {
    return null;
  }
  if (nodeAbove.expandable && dropLevel === nodeAbove.level + 1) {
    return nodeAbove.id;
  }
  const start = treeNodes.findIndex(n => n.id === nodeAbove.id);
  for (let i = start; i >= 0; i--) {
    const candidate = treeNodes[i];
    if (candidate.expandable && candidate.level === dropLevel - 1) {
      return candidate.id;
    }
    if (candidate.level < dropLevel - 1) {
      break;
    }
  }
  return null;
}

/**
 * Breadcrumb-style path (project name → … → element). A null or unresolvable
 * id resolves to the project root.
 */
export function buildElementPath(
  elements: MoveDialogContext['elements'],
  elementId: string | null,
  projectName: string,
  untitledName: string
): string {
  if (!elementId) {
    return projectName;
  }
  const map = new Map(elements.map(el => [el.id, el]));
  const chain: string[] = [];
  const visited = new Set<string>();
  let cursor = map.get(elementId);
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    chain.unshift(cursor.name || untitledName);
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
  }
  return [projectName, ...chain].join(' › ');
}

/** Where in the destination the item lands, in plain language. */
export function buildMovePositionLabel(
  nodeAbove: DropNode | null,
  dropLevel: number,
  translate: MoveDialogContext['translate']
): string {
  if (!nodeAbove) {
    return translate('dialogs.move.positionTop');
  }
  const params = { name: nodeAbove.name };
  if (dropLevel > nodeAbove.level) {
    return translate('dialogs.move.positionInside', params);
  }
  return translate('dialogs.move.positionAfter', params);
}

/**
 * Builds the "Move Item" confirmation data. The destination is derived from
 * the drop position itself, so the TO path and the position note always
 * describe the same place.
 */
export function buildMoveDialogData(
  ctx: MoveDialogContext
): MoveElementDialogData {
  const targetFolderId = findDropParentFolderId(
    ctx.treeNodes,
    ctx.nodeAbove,
    ctx.dropLevel
  );
  return {
    elementName: ctx.node.name,
    fromPath: buildElementPath(
      ctx.elements,
      ctx.node.id,
      ctx.projectName,
      ctx.untitledName
    ),
    toPath: buildElementPath(
      ctx.elements,
      targetFolderId,
      ctx.projectName,
      ctx.untitledName
    ),
    positionLabel: buildMovePositionLabel(
      ctx.nodeAbove,
      ctx.dropLevel,
      ctx.translate
    ),
  };
}
