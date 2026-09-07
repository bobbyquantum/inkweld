import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import {
  createDefaultPublishPlan,
  type ElementItem,
  type PublishPlan,
  PublishPlanItemType,
  type SeparatorItem,
  SeparatorStyle,
} from '@models/publish-plan';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  countWords,
  PublishPlanStatsService,
  WORDS_PER_MINUTE,
  WORDS_PER_PAGE,
} from './publish-plan-stats.service';

function element(
  id: string,
  type: ElementType,
  parentId: string | null = null
): Element {
  return {
    id,
    name: id,
    type,
    parentId,
    order: 0,
    level: parentId ? 1 : 0,
    expandable: type === ElementType.Folder,
    version: 1,
    metadata: {},
  };
}

function paragraph(text: string): unknown {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function elementItem(
  elementId: string,
  overrides: Partial<ElementItem> = {}
): ElementItem {
  return {
    id: `item-${elementId}`,
    type: PublishPlanItemType.Element,
    elementId,
    includeChildren: false,
    isChapter: true,
    ...overrides,
  };
}

/** Resolve pending microtasks so async counting settles. */
const flush = (): Promise<void> => new Promise(r => setTimeout(r, 0));

describe('PublishPlanStatsService', () => {
  let service: PublishPlanStatsService;
  let hasLocalContent: Mock<(id: string) => Promise<boolean>>;
  let getDocumentContent: Mock<(id: string) => Promise<unknown>>;

  const elements: Element[] = [
    element('folder', ElementType.Folder),
    element('doc-a', ElementType.Item, 'folder'),
    element('doc-b', ElementType.Item, 'folder'),
    element('wb', ElementType.Worldbuilding, 'folder'),
    element('doc-c', ElementType.Item),
  ];

  const contents: Record<string, unknown> = {
    'user:proj:doc-a': [paragraph('one two three')],
    'user:proj:doc-b': [paragraph('four five')],
    'user:proj:doc-c': [paragraph('six seven eight nine')],
  };

  beforeEach(() => {
    hasLocalContent = vi.fn<(id: string) => Promise<boolean>>(() =>
      Promise.resolve(true)
    );
    getDocumentContent = vi.fn<(id: string) => Promise<unknown>>(id =>
      Promise.resolve(contents[id])
    );

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: DocumentService,
          useValue: { hasLocalContent, getDocumentContent },
        },
        {
          provide: ProjectStateService,
          useValue: {
            elements: signal(elements),
            project: signal({ username: 'user', slug: 'proj' }),
          },
        },
      ],
    });
    service = TestBed.inject(PublishPlanStatsService);
  });

  describe('countWords', () => {
    it('counts words across paragraphs', () => {
      expect(countWords([paragraph('a b'), paragraph('c')])).toBe(3);
    });

    it('accepts a doc node wrapper', () => {
      expect(countWords({ type: 'doc', content: [paragraph('a b c')] })).toBe(
        3
      );
    });

    it('returns 0 for empty content', () => {
      expect(countWords(null)).toBe(0);
      expect(countWords([])).toBe(0);
    });
  });

  describe('ensureCounted', () => {
    it('marks documents loading then ready with their word counts', async () => {
      service.ensureCounted(['doc-c']);
      expect(service.wordCounts().get('doc-c')).toEqual({ status: 'loading' });

      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 4,
      });
      expect(hasLocalContent).toHaveBeenCalledWith('user:proj:doc-c');
      expect(getDocumentContent).toHaveBeenCalledWith('user:proj:doc-c');
    });

    it('expands folders to their descendant documents only', async () => {
      service.ensureCounted(['folder']);
      await flush();

      const counts = service.wordCounts();
      expect(counts.get('doc-a')).toEqual({ status: 'ready', words: 3 });
      expect(counts.get('doc-b')).toEqual({ status: 'ready', words: 2 });
      expect(counts.has('wb')).toBe(false);
      expect(counts.has('folder')).toBe(false);
    });

    it('does not re-read documents already counted', async () => {
      service.ensureCounted(['doc-c']);
      await flush();
      service.ensureCounted(['doc-c']);
      await flush();
      expect(getDocumentContent).toHaveBeenCalledTimes(1);
    });

    it('marks unsynced documents unavailable without reading them', async () => {
      hasLocalContent.mockResolvedValue(false);
      service.ensureCounted(['doc-c']);
      await flush();

      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'unavailable',
      });
      expect(getDocumentContent).not.toHaveBeenCalled();
    });

    it('marks documents unavailable when reading fails', async () => {
      getDocumentContent.mockRejectedValue(new Error('boom'));
      service.ensureCounted(['doc-c']);
      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'unavailable',
      });
    });
  });

  describe('invalidate', () => {
    it('drops all cached counts so they are re-read', async () => {
      service.ensureCounted(['doc-c']);
      await flush();
      service.invalidate();
      expect(service.wordCounts().size).toBe(0);

      service.ensureCounted(['doc-c']);
      await flush();
      expect(getDocumentContent).toHaveBeenCalledTimes(2);
    });

    it('expands folder ids to their descendant documents', async () => {
      service.ensureCounted(['folder', 'doc-c']);
      await flush();
      service.invalidate(['folder']);
      expect(service.wordCounts().has('doc-a')).toBe(false);
      expect(service.wordCounts().has('doc-b')).toBe(false);
      expect(service.wordCounts().has('doc-c')).toBe(true);
    });

    it('drops only the given ids', async () => {
      service.ensureCounted(['doc-a', 'doc-c']);
      await flush();
      service.invalidate(['doc-a']);
      expect(service.wordCounts().has('doc-a')).toBe(false);
      expect(service.wordCounts().has('doc-c')).toBe(true);
    });

    it('does not resurrect an id invalidated while counting', async () => {
      service.ensureCounted(['doc-c']);
      service.invalidate();
      await flush();
      expect(service.wordCounts().has('doc-c')).toBe(false);
    });
  });

  describe('itemStats', () => {
    it('reports a document row with its count', async () => {
      service.ensureCounted(['doc-c']);
      await flush();
      expect(service.itemStats(elementItem('doc-c'), elements)).toEqual({
        words: 4,
        documents: 1,
        entries: 0,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
      });
    });

    it('reports loading while the count is pending', () => {
      service.ensureCounted(['doc-c']);
      const stats = service.itemStats(elementItem('doc-c'), elements);
      expect(stats.loading).toBe(true);
      expect(stats.words).toBeNull();
    });

    it('sums documents under a folder when children are included', async () => {
      service.ensureCounted(['folder']);
      await flush();
      const stats = service.itemStats(
        elementItem('folder', { includeChildren: true }),
        elements
      );
      expect(stats).toEqual({
        words: 5,
        documents: 2,
        entries: 1,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
      });
    });

    it('reports nothing for a folder without children included', () => {
      const stats = service.itemStats(elementItem('folder'), elements);
      expect(stats.documents).toBe(0);
      expect(stats.words).toBeNull();
    });

    it('counts a worldbuilding element as one entry', () => {
      const stats = service.itemStats(elementItem('wb'), elements);
      expect(stats.entries).toBe(1);
      expect(stats.words).toBeNull();
    });

    it('reports nothing for canvases and other non-text elements', () => {
      const withCanvas = [...elements, element('canvas', ElementType.Canvas)];
      const stats = service.itemStats(elementItem('canvas'), withCanvas);
      expect(stats).toEqual({
        words: null,
        documents: 0,
        entries: 0,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
      });
    });

    it('counts pending and unavailable documents under a folder', async () => {
      hasLocalContent.mockImplementation(id =>
        Promise.resolve(!id.endsWith('doc-a'))
      );
      service.ensureCounted(['folder']);
      const item = elementItem('folder', { includeChildren: true });
      expect(service.itemStats(item, elements).loadingDocuments).toBe(2);

      await flush();
      const stats = service.itemStats(item, elements);
      expect(stats.loadingDocuments).toBe(0);
      expect(stats.unavailableDocuments).toBe(1);
      expect(stats.unavailable).toBe(true);
    });

    it('reports nothing for non-element items', () => {
      const separator: SeparatorItem = {
        id: 'sep',
        type: PublishPlanItemType.Separator,
        style: SeparatorStyle.SceneBreak,
      };
      expect(service.itemStats(separator, elements).documents).toBe(0);
    });

    it('flags unavailable documents', async () => {
      hasLocalContent.mockResolvedValue(false);
      service.ensureCounted(['doc-c']);
      await flush();
      const stats = service.itemStats(elementItem('doc-c'), elements);
      expect(stats.unavailable).toBe(true);
      expect(stats.words).toBeNull();
    });
  });

  describe('summary', () => {
    let plan: PublishPlan;

    beforeEach(() => {
      plan = createDefaultPublishPlan('T', 'A');
      plan.items = [
        elementItem('doc-c'),
        elementItem('folder', { includeChildren: true, isChapter: false }),
        elementItem('wb', { isChapter: false }),
        {
          id: 'sep',
          type: PublishPlanItemType.Separator,
          style: SeparatorStyle.PageBreak,
        },
      ];
    });

    it('rolls up counts, chapters, documents and entries', async () => {
      service.ensureCounted(['doc-c', 'folder']);
      await flush();

      const summary = service.summary(plan, elements);
      expect(summary.items).toBe(4);
      expect(summary.chapters).toBe(1);
      expect(summary.documents).toBe(3);
      expect(summary.entries).toBe(2);
      expect(summary.words).toBe(9);
      expect(summary.loading).toBe(0);
      expect(summary.unavailable).toBe(0);
      expect(summary.estimatedPages).toBe(Math.ceil(9 / WORDS_PER_PAGE));
      expect(summary.readingMinutes).toBe(Math.ceil(9 / WORDS_PER_MINUTE));
    });

    it('counts pending and unavailable rows', async () => {
      hasLocalContent.mockImplementation(id =>
        Promise.resolve(!id.endsWith('doc-a'))
      );
      service.ensureCounted(['doc-c', 'folder']);
      const before = service.summary(plan, elements);
      // doc-c plus doc-a and doc-b under the folder
      expect(before.loading).toBe(3);

      await flush();
      const after = service.summary(plan, elements);
      expect(after.loading).toBe(0);
      expect(after.unavailable).toBe(1);
      expect(after.words).toBe(6);
    });

    it('counts documents, not rows, for loading and unavailable totals', async () => {
      hasLocalContent.mockImplementation(() => Promise.resolve(false));
      service.ensureCounted(['doc-c', 'folder']);
      // doc-c + doc-a + doc-b are all pending: three documents across two rows
      expect(service.summary(plan, elements).loading).toBe(3);
      await flush();
      expect(service.summary(plan, elements).unavailable).toBe(3);
    });
  });
});
