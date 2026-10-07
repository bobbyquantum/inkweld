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
 * What "add everything" does with one element: add it as an item, open it
 * up and look at its contents instead, or leave it out.
 */
function planAction(
  element: Element,
  contents: readonly Element[],
  covered: ReadonlySet<string>
): 'add' | 'open' | 'skip' {
  const isFolder = element.type === ElementType.Folder;
  if (covered.has(element.id)) {
    // A folder listed without its contents still leaves them to add.
    return isFolder ? 'open' : 'skip';
  }
  if (!isFolder) return publishesOnItsOwn(element) ? 'add' : 'skip';
  if (!contents.some(publishesOnItsOwn)) return 'skip';
  return contents.some(e => covered.has(e.id)) ? 'open' : 'add';
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
      const end = subtreeEnd(elements, i);
      const action = planAction(element, elements.slice(i + 1, end), covered);
      if (action === 'add') {
        items.push(elementPlanItem(element.id, element.type));
      } else if (action === 'open') {
        visit(i + 1, end);
      }
    }
  };

  visit(0, elements.length);
  return items;
}

/**
 * True when adding `elementId` would publish something twice: it is already
 * covered by the plan, or it is a folder with some of its contents already
 * covered.
 */
export function overlapsPlan(
  plan: PublishPlan,
  elements: readonly Element[],
  elementId: string
): boolean {
  const covered = coveredElementIds(plan, elements);
  if (covered.has(elementId)) return true;

  const index = elements.findIndex(e => e.id === elementId);
  if (index === -1 || elements[index].type !== ElementType.Folder) {
    return false;
  }
  for (let i = index + 1; i < subtreeEnd(elements, index); i++) {
    if (covered.has(elements[i].id)) return true;
  }
  return false;
}

/**
 * Plan items for `candidates`, in order, leaving out any that would publish
 * something already in the plan or already picked earlier in the list.
 */
export function addablePlanItems(
  plan: PublishPlan,
  elements: readonly Element[],
  candidates: readonly Pick<Element, 'id' | 'type'>[]
): ElementItem[] {
  const added: ElementItem[] = [];
  for (const candidate of candidates) {
    if (!isPlannableType(candidate.type)) continue;
    const sofar = { ...plan, items: [...plan.items, ...added] };
    if (overlapsPlan(sofar, elements, candidate.id)) continue;
    added.push(elementPlanItem(candidate.id, candidate.type));
  }
  return added;
}

/** The starter README every new project gets; never part of the manuscript. */
function isReadme(element: Element): boolean {
  return (
    element.type === ElementType.Item &&
    levelOf(element) === 0 &&
    element.name.trim().toLowerCase() === 'readme'
  );
}

/** Prose that belongs in a book: not a note, not the README, not worldbuilding. */
function isManuscriptDoc(element: Element): boolean {
  return (
    element.type === ElementType.Item &&
    !isReadme(element) &&
    isPublishableByDefault(element.metadata)
  );
}

/**
 * Starter items for a new plan: the project's manuscript. Top-level folders
 * made only of manuscript prose are listed whole; a folder that also holds
 * worldbuilding, notes-only content or the README is opened up so just its
 * prose is listed. Worldbuilding and the README are left out.
 */
export function manuscriptPlanItems(
  elements: readonly Element[]
): ElementItem[] {
  const items: ElementItem[] = [];

  const visit = (from: number, to: number): void => {
    for (let i = from; i < to; i = subtreeEnd(elements, i)) {
      const element = elements[i];
      const end = subtreeEnd(elements, i);
      if (element.type !== ElementType.Folder) {
        if (isManuscriptDoc(element)) {
          items.push(elementPlanItem(element.id, element.type));
        }
        continue;
      }
      const contents = elements.slice(i + 1, end);
      if (!contents.some(isManuscriptDoc)) continue;
      const onlyManuscript = contents.every(
        e => e.type === ElementType.Folder || isManuscriptDoc(e)
      );
      if (onlyManuscript) {
        items.push(elementPlanItem(element.id, element.type));
      } else {
        visit(i + 1, end);
      }
    }
  };

  visit(0, elements.length);
  return items;
}
