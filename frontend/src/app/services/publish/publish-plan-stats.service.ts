import { inject, Injectable, signal } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  type PublishPlan,
  type PublishPlanItem,
  PublishPlanItemType,
} from '@models/publish-plan';
import { flattenToPlainText } from '@utils/prosemirror-text';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';

import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

/** Words per printed page used for the page estimate (trade paperback). */
export const WORDS_PER_PAGE = 275;

/** Average adult silent reading speed in words per minute. */
export const WORDS_PER_MINUTE = 238;

/**
 * Word count status for a single document element.
 *
 * - `loading`: content is being read from local storage
 * - `ready`: `words` holds the counted value
 * - `unavailable`: the document has not been synced to this device yet, so
 *   its length is unknown until the plan is published (which syncs first)
 */
export type WordCountEntry =
  | { status: 'loading' }
  | { status: 'ready'; words: number }
  | { status: 'unavailable' };

/** Statistics for one row in the plan's contents list. */
export interface PlanItemStats {
  /** Counted words, or null when nothing countable / still loading. */
  words: number | null;
  /** Number of documents this row contributes (folders can contribute many). */
  documents: number;
  /** Number of worldbuilding entries this row contributes. */
  entries: number;
  /** True while any contributing document is still being counted. */
  loading: boolean;
  /** True when any contributing document is not available locally. */
  unavailable: boolean;
}

/** Aggregate statistics for the whole plan. */
export interface PlanSummaryStats {
  items: number;
  chapters: number;
  documents: number;
  entries: number;
  words: number;
  /** Documents still being counted. */
  loading: number;
  /** Documents whose content is not available on this device. */
  unavailable: number;
  estimatedPages: number;
  readingMinutes: number;
}

/**
 * Computes word counts and roll-up statistics for publish plans.
 *
 * Word counts are read once per document from the local Yjs store (or the
 * live collaboration connection when the document is open) and cached for
 * the lifetime of the app. Callers request counts via {@link ensureCounted}
 * and read results reactively through {@link wordCounts}; {@link invalidate}
 * drops the cache so a refresh re-reads current content.
 */
@Injectable({ providedIn: 'root' })
export class PublishPlanStatsService {
  private readonly documentService = inject(DocumentService);
  private readonly projectState = inject(ProjectStateService);

  private readonly counts = signal<ReadonlyMap<string, WordCountEntry>>(
    new Map()
  );

  /** Element id → word count entry. Reactive; updates as counts resolve. */
  readonly wordCounts = this.counts.asReadonly();

  /**
   * Start counting any element in `elementIds` that has not been counted yet.
   * Folders are expanded to their document descendants; worldbuilding and
   * other non-document elements are ignored.
   */
  ensureCounted(elementIds: Iterable<string>): void {
    const elements = this.projectState.elements();
    const pending: string[] = [];
    for (const id of elementIds) {
      for (const doc of this.documentsUnder(id, elements)) {
        if (!this.counts().has(doc.id)) {
          pending.push(doc.id);
        }
      }
    }
    if (pending.length === 0) return;

    this.counts.update(map => {
      const next = new Map(map);
      for (const id of pending) next.set(id, { status: 'loading' });
      return next;
    });
    for (const id of pending) {
      void this.countDocument(id);
    }
  }

  /** Drop cached counts (all, or for the given element ids). */
  invalidate(elementIds?: Iterable<string>): void {
    if (!elementIds) {
      this.counts.set(new Map());
      return;
    }
    this.counts.update(map => {
      const next = new Map(map);
      for (const id of elementIds) next.delete(id);
      return next;
    });
  }

  /** Statistics for a single plan row. */
  itemStats(
    item: PublishPlanItem,
    elements: readonly Element[],
    counts: ReadonlyMap<string, WordCountEntry> = this.counts()
  ): PlanItemStats {
    const stats: PlanItemStats = {
      words: null,
      documents: 0,
      entries: 0,
      loading: false,
      unavailable: false,
    };
    if (item.type !== PublishPlanItemType.Element) return stats;

    const element = elements.find(e => e.id === item.elementId);
    if (!element) return stats;

    if (isWorldbuildingType(element.type)) {
      stats.entries = 1;
      return stats;
    }

    let docs: Element[] = [];
    if (element.type === ElementType.Item) {
      docs = [element];
    } else if (element.type === ElementType.Folder && item.includeChildren) {
      docs = this.documentsUnder(element.id, elements);
      stats.entries = this.entriesUnder(element.id, elements);
    }
    // Canvases, timelines and relationship charts carry no countable text.

    let total = 0;
    let counted = false;
    for (const doc of docs) {
      stats.documents++;
      const entry = counts.get(doc.id);
      if (!entry || entry.status === 'loading') {
        stats.loading = true;
      } else if (entry.status === 'unavailable') {
        stats.unavailable = true;
      } else {
        total += entry.words;
        counted = true;
      }
    }
    stats.words = counted ? total : null;
    return stats;
  }

  /** Roll-up statistics for the whole plan. */
  summary(
    plan: PublishPlan,
    elements: readonly Element[],
    counts: ReadonlyMap<string, WordCountEntry> = this.counts()
  ): PlanSummaryStats {
    const summary: PlanSummaryStats = {
      items: plan.items.length,
      chapters: 0,
      documents: 0,
      entries: 0,
      words: 0,
      loading: 0,
      unavailable: 0,
      estimatedPages: 0,
      readingMinutes: 0,
    };

    for (const item of plan.items) {
      if (item.type === PublishPlanItemType.Element && item.isChapter) {
        summary.chapters++;
      }
      const stats = this.itemStats(item, elements, counts);
      summary.documents += stats.documents;
      summary.entries += stats.entries;
      summary.words += stats.words ?? 0;
      if (stats.loading) summary.loading++;
      if (stats.unavailable) summary.unavailable++;
    }

    summary.estimatedPages = Math.ceil(summary.words / WORDS_PER_PAGE);
    summary.readingMinutes = Math.ceil(summary.words / WORDS_PER_MINUTE);
    return summary;
  }

  /** Every document element that is `elementId` itself or a descendant of it. */
  private documentsUnder(
    elementId: string,
    elements: readonly Element[]
  ): Element[] {
    const root = elements.find(e => e.id === elementId);
    if (!root) return [];
    if (root.type === ElementType.Item) return [root];
    if (root.type !== ElementType.Folder) return [];

    const out: Element[] = [];
    const walk = (parentId: string): void => {
      for (const child of elements) {
        if (child.parentId !== parentId) continue;
        if (child.type === ElementType.Item) out.push(child);
        else if (child.type === ElementType.Folder) walk(child.id);
      }
    };
    walk(root.id);
    return out;
  }

  /** Number of worldbuilding entries nested under a folder. */
  private entriesUnder(folderId: string, elements: readonly Element[]): number {
    let count = 0;
    const walk = (parentId: string): void => {
      for (const child of elements) {
        if (child.parentId !== parentId) continue;
        if (isWorldbuildingType(child.type)) count++;
        else if (child.type === ElementType.Folder) walk(child.id);
      }
    };
    walk(folderId);
    return count;
  }

  private fullDocumentId(elementId: string): string {
    if (elementId.includes(':')) return elementId;
    const project = this.projectState.project();
    if (!project) return elementId;
    return `${project.username}:${project.slug}:${elementId}`;
  }

  private async countDocument(elementId: string): Promise<void> {
    const docId = this.fullDocumentId(elementId);
    let entry: WordCountEntry;
    try {
      const available = await this.documentService.hasLocalContent(docId);
      if (!available) {
        entry = { status: 'unavailable' };
      } else {
        const content = await this.documentService.getDocumentContent(docId);
        entry = { status: 'ready', words: countWords(content) };
      }
    } catch {
      entry = { status: 'unavailable' };
    }
    this.counts.update(map => {
      // A concurrent invalidate() may have dropped this id; don't resurrect it.
      if (!map.has(elementId)) return map;
      const next = new Map(map);
      next.set(elementId, entry);
      return next;
    });
  }
}

/** Count whitespace-separated words in ProseMirror JSON content. */
export function countWords(content: unknown): number {
  if (!content) return 0;
  const text = flattenToPlainText(contentNodes(content));
  return text.split(/\s+/).filter(Boolean).length;
}

/** Normalise a content array, a `doc` wrapper node, or a single node to nodes. */
function contentNodes(content: unknown): unknown[] {
  if (Array.isArray(content)) return content;
  const wrapper = content as { content?: unknown };
  if (typeof content === 'object' && Array.isArray(wrapper.content)) {
    return wrapper.content;
  }
  return [content];
}
