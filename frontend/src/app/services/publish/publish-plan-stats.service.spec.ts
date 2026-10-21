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
  PAGES_PER_ENTRY,
  PAGES_PER_IMAGE,
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
  let syncDocumentToServer: Mock<
    (id: string, timeoutMs?: number) => Promise<string | null>
  >;
  let isDocumentUnavailable: Mock<(id: string) => Promise<boolean>>;

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

    syncDocumentToServer = vi.fn<
      (id: string, timeoutMs?: number) => Promise<string | null>
    >(() => Promise.resolve(null));
    // Server mode, document created elsewhere: missing content must be pulled.
    isDocumentUnavailable = vi.fn<(id: string) => Promise<boolean>>(() =>
      Promise.resolve(true)
    );

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: DocumentService,
          useValue: {
            hasLocalContent,
            getDocumentContent,
            syncDocumentToServer,
          },
        },
        {
          provide: ProjectStateService,
          useValue: {
            elements: signal(elements),
            project: signal({ username: 'user', slug: 'proj' }),
            isDocumentUnavailable,
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
        images: 0,
      });
      expect(hasLocalContent).toHaveBeenCalledWith('user:proj:doc-c');
      expect(getDocumentContent).toHaveBeenCalledWith('user:proj:doc-c');
    });

    it('expands folders to their descendant documents only', async () => {
      service.ensureCounted(['folder']);
      await flush();

      const counts = service.wordCounts();
      expect(counts.get('doc-a')).toEqual({
        status: 'ready',
        words: 3,
        images: 0,
      });
      expect(counts.get('doc-b')).toEqual({
        status: 'ready',
        words: 2,
        images: 0,
      });
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

    it('downloads a document with no local copy and then counts it', async () => {
      let pulled = false;
      hasLocalContent.mockImplementation(() => Promise.resolve(pulled));
      syncDocumentToServer.mockImplementation(() => {
        pulled = true;
        return Promise.resolve('digest');
      });

      service.ensureCounted(['doc-c']);
      // Still loading, not a wrong number or a "not synced" badge
      expect(service.wordCounts().get('doc-c')).toEqual({ status: 'loading' });
      await flush();

      expect(syncDocumentToServer).toHaveBeenCalledWith(
        'user:proj:doc-c',
        expect.any(Number)
      );
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 4,
        images: 0,
      });
    });

    it('stays unavailable when the download fails', async () => {
      hasLocalContent.mockResolvedValue(false);
      syncDocumentToServer.mockRejectedValue(new Error('offline'));
      service.ensureCounted(['doc-c']);
      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'unavailable',
      });
    });

    it('counts a document with nothing stored as empty when it can only be local', async () => {
      // Local mode (or created on this device): there is no server copy, so
      // no content means no words, not "not synced".
      hasLocalContent.mockResolvedValue(false);
      isDocumentUnavailable.mockResolvedValue(false);
      service.ensureCounted(['doc-c']);
      await flush();

      expect(isDocumentUnavailable).toHaveBeenCalledWith('doc-c');
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 0,
        images: 0,
      });
      expect(syncDocumentToServer).not.toHaveBeenCalled();
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

  describe('recount', () => {
    it('re-reads counted documents and keeps the old count meanwhile', async () => {
      service.ensureCounted(['folder']);
      await flush();

      contents['user:proj:doc-a'] = [paragraph('one two three four five')];
      service.recount(['folder']);
      expect(service.wordCounts().get('doc-a')).toEqual({
        status: 'ready',
        words: 3,
        images: 0,
      });

      await flush();
      expect(service.wordCounts().get('doc-a')).toEqual({
        status: 'ready',
        words: 5,
        images: 0,
      });
      contents['user:proj:doc-a'] = [paragraph('one two three')];
    });

    it('keeps the newest count when an older read finishes last', async () => {
      let releaseFirst!: () => void;
      getDocumentContent.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseFirst = () => resolve([paragraph('stale')]);
          })
      );
      service.ensureCounted(['doc-c']);
      await flush();

      service.recount(['doc-c']);
      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 4,
        images: 0,
      });

      releaseFirst();
      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 4,
        images: 0,
      });
    });

    it('counts documents that were never counted', async () => {
      service.recount(['doc-c', 'wb']);
      expect(service.wordCounts().get('doc-c')).toEqual({ status: 'loading' });
      expect(service.wordCounts().has('wb')).toBe(false);

      await flush();
      expect(service.wordCounts().get('doc-c')).toEqual({
        status: 'ready',
        words: 4,
        images: 0,
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
        images: 0,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
        skippedNotes: 0,
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
        images: 0,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
        skippedNotes: 0,
      });
    });

    it('leaves notes inside a folder out of its totals', () => {
      const withNote = [
        ...elements.slice(0, 3),
        {
          ...element('note', ElementType.Item, 'folder'),
          metadata: { role: 'note' },
        },
        ...elements.slice(3),
      ];
      const stats = service.itemStats(
        elementItem('folder', { includeChildren: true }),
        withNote,
        new Map([
          ['doc-a', { status: 'ready', words: 3 }],
          ['doc-b', { status: 'ready', words: 2 }],
          ['note', { status: 'ready', words: 100 }],
        ])
      );
      expect(stats.words).toBe(5);
      expect(stats.documents).toBe(2);
      expect(stats.skippedNotes).toBe(1);
    });

    it('lists the notes a folder row leaves out, including nested ones', () => {
      const withNotes = [
        ...elements,
        element('sub', ElementType.Folder, 'folder'),
        {
          ...element('nested-note', ElementType.Item, 'sub'),
          metadata: { role: 'note' },
        },
        {
          ...element('scene', ElementType.Item, 'sub'),
          metadata: { role: 'scene' },
        },
      ];
      const folderRow = elementItem('folder', { includeChildren: true });

      expect(service.skippedNotes(folderRow, withNotes).map(e => e.id)).toEqual(
        ['nested-note']
      );
      expect(service.itemStats(folderRow, withNotes).skippedNotes).toBe(1);
      // A folder without its contents, or a single document, skips nothing.
      expect(service.skippedNotes(elementItem('folder'), withNotes)).toEqual(
        []
      );
      expect(
        service.skippedNotes(elementItem('nested-note'), withNotes)
      ).toEqual([]);
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
        images: 0,
        loading: false,
        unavailable: false,
        loadingDocuments: 0,
        unavailableDocuments: 0,
        skippedNotes: 0,
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
      expect(summary.images).toBe(0);
      // Two worldbuilding entries take far more page than their words.
      expect(summary.estimatedPages).toBe(
        Math.ceil(9 / WORDS_PER_PAGE + 2 * PAGES_PER_ENTRY)
      );
      expect(summary.readingMinutes).toBe(Math.ceil(9 / WORDS_PER_MINUTE));
    });

    it('allows page space for the images in counted documents', async () => {
      const image = { type: 'image', attrs: { src: 'media:map' } };
      getDocumentContent.mockImplementation(id =>
        Promise.resolve(
          id === 'user:proj:doc-c'
            ? [
                paragraph('six seven'),
                image,
                { type: 'paragraph', content: [image] },
                { type: 'blockquote', content: [{ ...image }] },
              ]
            : contents[id]
        )
      );
      plan.items = [elementItem('doc-c')];
      service.ensureCounted(['doc-c']);
      await flush();

      expect(service.itemStats(plan.items[0], elements).images).toBe(3);
      const summary = service.summary(plan, elements);
      expect(summary.images).toBe(3);
      expect(summary.estimatedPages).toBe(
        Math.ceil(2 / WORDS_PER_PAGE + 3 * PAGES_PER_IMAGE)
      );
    });

    it('estimates pages for a plan of worldbuilding entries alone', () => {
      plan.items = [elementItem('wb', { isChapter: false })];
      const summary = service.summary(plan, elements);
      expect(summary.words).toBe(0);
      expect(summary.estimatedPages).toBe(PAGES_PER_ENTRY);
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

    it('totals the notes left out of listed folders', () => {
      const withNote = [
        ...elements,
        {
          ...element('note', ElementType.Item, 'folder'),
          metadata: { role: 'note' },
        },
      ];
      expect(service.summary(plan, withNote).skippedNotes).toBe(1);
      expect(service.summary(plan, elements).skippedNotes).toBe(0);
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

  describe('publishedDocumentIds', () => {
    it('lists listed documents and the non-note documents in listed folders', () => {
      const withNote = [
        ...elements,
        {
          ...element('note', ElementType.Item, 'folder'),
          metadata: { role: 'note' },
        },
        {
          ...element('listed-note', ElementType.Item),
          metadata: { role: 'note' },
        },
      ];
      const plan = createDefaultPublishPlan('T', 'A');
      plan.items = [
        elementItem('doc-c'),
        elementItem('folder', { includeChildren: true }),
        // A note listed on its own is published.
        elementItem('listed-note'),
        elementItem('wb'),
      ];

      expect(service.publishedDocumentIds(plan, withNote)).toEqual([
        'doc-c',
        'doc-a',
        'doc-b',
        'listed-note',
      ]);
    });
  });
});
