import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishPlan,
  type ElementItem,
  type PublishPlan,
} from '@models/publish-plan';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addablePlanItems,
  coveredElementIds,
  elementPlanItem,
  isPlannableType,
  overlapsPlan,
  uncoveredPlanItems,
} from './plan-contents';

const { Folder, Item, Worldbuilding, Canvas } = ElementType;

function el(
  id: string,
  type: ElementType,
  level: number,
  metadata: Record<string, string> = {}
): Element {
  return {
    id,
    name: id,
    type,
    level,
    parentId: null,
    order: 0,
    expandable: type === Folder,
    version: 1,
    metadata,
  };
}

/**
 * manuscript/          front-matter (note)
 *   part-1/            maps/ (canvas only)
 *     scene-a          characters/
 *     scene-b            hero (worldbuilding)
 *   research (note)
 * epilogue
 */
const elements: Element[] = [
  el('manuscript', Folder, 0),
  el('part-1', Folder, 1),
  el('scene-a', Item, 2, { role: 'scene' }),
  el('scene-b', Item, 2, { role: 'scene' }),
  el('research', Item, 1, { role: 'note' }),
  el('front-matter', Item, 0, { role: 'note' }),
  el('maps', Folder, 0),
  el('board', Canvas, 1),
  el('characters', Folder, 0),
  el('hero', Worldbuilding, 1),
  el('epilogue', Item, 0),
];

const ids = (items: ElementItem[]) => items.map(i => i.elementId);

describe('plan contents', () => {
  let plan: PublishPlan;

  beforeEach(() => {
    plan = createDefaultPublishPlan('Book', 'Author');
  });

  const withItems = (...items: ElementItem[]): PublishPlan => ({
    ...plan,
    items,
  });

  describe('isPlannableType', () => {
    it('accepts folders, documents and worldbuilding only', () => {
      expect(isPlannableType(Folder)).toBe(true);
      expect(isPlannableType(Item)).toBe(true);
      expect(isPlannableType(Worldbuilding)).toBe(true);
      expect(isPlannableType(Canvas)).toBe(false);
      expect(isPlannableType(ElementType.Timeline)).toBe(false);
      expect(isPlannableType(undefined)).toBe(false);
    });
  });

  describe('elementPlanItem', () => {
    it('makes a folder bring its contents', () => {
      expect(elementPlanItem('manuscript', Folder)).toMatchObject({
        elementId: 'manuscript',
        includeChildren: true,
        isChapter: true,
      });
      expect(elementPlanItem('epilogue', Item).includeChildren).toBe(false);
      expect(elementPlanItem('x', undefined).includeChildren).toBe(false);
    });
  });

  describe('coveredElementIds', () => {
    it('covers listed elements and the contents of listed folders', () => {
      const covered = coveredElementIds(
        withItems(
          elementPlanItem('part-1', Folder),
          elementPlanItem('epilogue', Item)
        ),
        elements
      );
      expect([...covered].sort()).toEqual(
        ['epilogue', 'part-1', 'scene-a', 'scene-b'].sort()
      );
    });

    it('does not cover the contents of a folder listed without them', () => {
      const legacy = { ...elementPlanItem('part-1', Folder) };
      legacy.includeChildren = false;
      expect([...coveredElementIds(withItems(legacy), elements)]).toEqual([
        'part-1',
      ]);
    });

    it('ignores items whose element is gone', () => {
      const covered = coveredElementIds(
        withItems(elementPlanItem('deleted', Folder)),
        elements
      );
      expect([...covered]).toEqual(['deleted']);
    });
  });

  describe('uncoveredPlanItems', () => {
    it('adds top-level folders whole and skips notes and empty folders', () => {
      const items = uncoveredPlanItems(plan, elements);
      expect(ids(items)).toEqual(['manuscript', 'characters', 'epilogue']);
      expect(items.map(i => i.includeChildren)).toEqual([true, true, false]);
    });

    it('opens up a folder whose contents are partly listed', () => {
      const items = uncoveredPlanItems(
        withItems(elementPlanItem('scene-b', Item)),
        elements
      );
      // part-1 cannot be added whole without publishing scene-b twice.
      expect(ids(items)).toEqual(['scene-a', 'characters', 'epilogue']);
    });

    it('adds nothing that a listed folder already publishes', () => {
      const items = uncoveredPlanItems(
        withItems(elementPlanItem('part-1', Folder)),
        elements
      );
      expect(ids(items)).toEqual(['characters', 'epilogue']);
    });

    it('adds nothing when everything is listed', () => {
      const first = uncoveredPlanItems(plan, elements);
      expect(uncoveredPlanItems(withItems(...first), elements)).toEqual([]);
    });

    it('still adds the contents of a folder listed without them', () => {
      const legacy = elementPlanItem('manuscript', Folder);
      legacy.includeChildren = false;
      const items = uncoveredPlanItems(withItems(legacy), elements);
      expect(ids(items)).toEqual(['part-1', 'characters', 'epilogue']);
    });

    it('treats elements without a level as top level', () => {
      const flat = [
        { ...el('a', Item, 0), level: undefined as unknown as number },
        { ...el('b', Item, 0), level: undefined as unknown as number },
      ];
      expect(ids(uncoveredPlanItems(plan, flat))).toEqual(['a', 'b']);
    });
  });

  describe('overlapsPlan', () => {
    it('flags an element inside a listed folder', () => {
      const p = withItems(elementPlanItem('part-1', Folder));
      expect(overlapsPlan(p, elements, 'scene-a')).toBe(true);
      expect(overlapsPlan(p, elements, 'part-1')).toBe(true);
      expect(overlapsPlan(p, elements, 'epilogue')).toBe(false);
    });

    it('flags a folder whose contents are partly listed', () => {
      const p = withItems(elementPlanItem('scene-b', Item));
      expect(overlapsPlan(p, elements, 'manuscript')).toBe(true);
      expect(overlapsPlan(p, elements, 'part-1')).toBe(true);
      expect(overlapsPlan(p, elements, 'characters')).toBe(false);
    });

    it('does not flag unknown elements', () => {
      expect(overlapsPlan(plan, elements, 'missing')).toBe(false);
    });
  });

  describe('addablePlanItems', () => {
    it('skips candidates already in the plan or picked earlier', () => {
      const p = withItems(elementPlanItem('epilogue', Item));
      const items = addablePlanItems(p, elements, [
        { id: 'part-1', type: Folder },
        { id: 'scene-a', type: Item },
        { id: 'manuscript', type: Folder },
        { id: 'epilogue', type: Item },
        { id: 'board', type: Canvas },
        { id: 'hero', type: Worldbuilding },
      ]);
      expect(ids(items)).toEqual(['part-1', 'hero']);
      expect(items[0].includeChildren).toBe(true);
    });
  });
});
