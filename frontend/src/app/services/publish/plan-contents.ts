/**
 * Which project elements a publish plan lists, and how.
 *
 * A folder is listed as one item with `includeChildren`, so the generators
 * publish whatever is inside it in tree order at publish time. Reordering
 * scenes on the corkboard or in the tree therefore changes the publication
 * without touching the plan.
 */

import { type Element, ElementType } from '@inkweld/index';
import {
  type ElementItem,
  type PublishPlan,
  PublishPlanItemType,
} from '@models/publish-plan';
import { isPublishableByDefault } from '@models/scene-metadata';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';

/** Element types with no text output; a plan never lists them. */
export const NON_TEXT_TYPES: readonly ElementType[] = [
  ElementType.Canvas,
  ElementType.Timeline,
  ElementType.RelationshipChart,
];

/** Folders, prose documents and worldbuilding entries can be listed. */
export function isPlannableType(type: ElementType | undefined): boolean {
  return (
    type === ElementType.Folder ||
    type === ElementType.Item ||
    (type !== undefined && isWorldbuildingType(type))
  );
}

/** A plan item for an element; folders bring their contents. */
export function elementPlanItem(
  elementId: string,
  type: ElementType | undefined
): ElementItem {
  return {
    id: crypto.randomUUID(),
    type: PublishPlanItemType.Element,
    elementId,
    includeChildren: type === ElementType.Folder,
    isChapter: true,
  };
}

/** The plan's element items. */
function elementItems(plan: PublishPlan): ElementItem[] {
  return plan.items.filter(
    (item): item is ElementItem => item.type === PublishPlanItemType.Element
  );
}

const levelOf = (element: Element): number => element.level ?? 0;

/** Index just past the subtree rooted at `index`. */
function subtreeEnd(elements: readonly Element[], index: number): number {
  const level = levelOf(elements[index]);
  let end = index + 1;
  while (end < elements.length && levelOf(elements[end]) > level) end++;
  return end;
}

/** Ids already published by the plan: listed items and listed folders' contents. */
export function coveredElementIds(
  plan: PublishPlan,
  elements: readonly Element[]
): Set<string> {
  const covered = new Set<string>();
  for (const item of elementItems(plan)) {
    covered.add(item.elementId);
    if (!item.includeChildren) continue;
    const index = elements.findIndex(e => e.id === item.elementId);
    if (index === -1) continue;
    for (let i = index + 1; i < subtreeEnd(elements, index); i++) {
      covered.add(elements[i].id);
    }
  }
  return covered;
}

/** True when a lone element would publish something. */
function publishesOnItsOwn(element: Element): boolean {
  if (element.type === ElementType.Item) {
    return isPublishableByDefault(element.metadata);
  }
  return isWorldbuildingType(element.type);
}

/**
 * Items that add everything the plan does not publish yet, as high up the
 * tree as possible: each top-level folder becomes one item. A folder that
 * already has some of its contents listed individually is opened up
 * instead, so nothing is published twice. Notes, empty folders and
 * elements without text are left out.
 */
export function uncoveredPlanItems(
  plan: PublishPlan,
  elements: readonly Element[]
): ElementItem[] {
  const covered = coveredElementIds(plan, elements);
  const items: ElementItem[] = [];

  const visit = (from: number, to: number): void => {
    for (let i = from; i < to; i = subtreeEnd(elements, i)) {
      const element = elements[i];
      if (covered.has(element.id)) continue;

      if (element.type !== ElementType.Folder) {
        if (publishesOnItsOwn(element)) {
          items.push(elementPlanItem(element.id, element.type));
        }
        continue;
      }

      const end = subtreeEnd(elements, i);
      const contents = elements.slice(i + 1, end);
      if (!contents.some(publishesOnItsOwn)) continue;
      if (contents.some(e => covered.has(e.id))) {
        visit(i + 1, end);
      } else {
        items.push(elementPlanItem(element.id, element.type));
      }
    }
  };

  visit(0, elements.length);
  return items;
}
