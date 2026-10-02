import { inject, Injectable } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import {
  getDocumentRole,
  readSceneMetadata,
  type SceneMetadata,
  sceneMetadataPatch,
  type SceneStatus,
} from '@models/scene-metadata';
import { formatTimePoint } from '@models/time-system';

import { DialogGatewayService } from '../core/dialog-gateway.service';
import {
  PublishPlanStatsService,
  type WordCountEntry,
} from '../publish/publish-plan-stats.service';
import { RelationshipService } from '../relationship/relationship.service';
import {
  SCENE_LOCATION_RELATIONSHIP_TYPE,
  SCENE_POV_RELATIONSHIP_TYPE,
} from '../relationship/scene-relationship-types';
import { TimeSystemLibraryService } from '../timeline/time-system-library.service';
import { WorldbuildingService } from '../worldbuilding/worldbuilding.service';
import { ProjectStateService } from './project-state.service';

/** What a row in the corkboard / outline represents. */
export type SceneOverviewKind =
  | 'folder'
  | 'scene'
  | 'note'
  /** A prose document with no role. */
  | 'document'
  /** Worldbuilding entries, canvases, timelines, charts. */
  | 'other';

/** Whether {@link SceneOverviewRow.words} can be trusted yet. */
export type WordCountState = 'ready' | 'loading' | 'unavailable' | 'none';

/** One element of a folder, with everything the manuscript views display. */
export interface SceneOverviewRow {
  element: Element;
  /** 0 for a direct child of the folder, 1 for a grandchild, … */
  depth: number;
  kind: SceneOverviewKind;
  scene: SceneMetadata;
  pov: Element[];
  location: Element[];
  /** Formatted in-world date, or null when unset. */
  storyDateLabel: string | null;
  /**
   * Words written. For a folder, the total of the prose documents below it
   * that have been counted so far.
   */
  words: number;
  wordsState: WordCountState;
  /** Word target. For a folder, the sum of its scenes' targets (0 if none). */
  wordTarget: number;
  /** 0–100 progress towards the word target, or null without a target. */
  progress: number | null;
  /** 1-based position among the scenes listed, or null for non-scenes. */
  sceneNumber: number | null;
  /** Number of scenes below a folder (0 for anything else). */
  sceneCount: number;
}

/** Totals shown under the outline. */
export interface SceneOverviewTotals {
  scenes: number;
  words: number;
  wordTarget: number;
  wordsState: WordCountState;
  /** Scenes per status, in progression order; `none` counts unset ones. */
  byStatus: Record<SceneStatus | 'none', number>;
}

interface SceneLinks {
  pov: Element[];
  location: Element[];
}

const NO_LINKS: SceneLinks = { pov: [], location: [] };

/**
 * Read model and edit actions shared by the corkboard and outline views of a
 * folder. {@link rows} reads only signals, so calling it from a `computed`
 * keeps a view current as elements, relationships and word counts change.
 */
@Injectable({ providedIn: 'root' })
export class SceneOverviewService {
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly stats = inject(PublishPlanStatsService);
  private readonly timeSystemLibrary = inject(TimeSystemLibraryService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialogGateway = inject(DialogGatewayService);

  readonly canWrite = this.projectState.canWrite;

  /**
   * The elements inside `folderId` in tree order. `deep` includes every
   * descendant (outline); otherwise only direct children (corkboard).
   * `proseOnly` drops everything that is not a folder or a prose document.
   */
  rows(
    folderId: string,
    options: { deep?: boolean; proseOnly?: boolean } = {}
  ): SceneOverviewRow[] {
    const elements = this.projectState.elements();
    const folderIndex = elements.findIndex(e => e.id === folderId);
    if (folderIndex === -1) return [];

    const counts = this.stats.wordCounts();
    const links = this.sceneLinks(elements);
    const folderLevel = elements[folderIndex].level;
    const rows: SceneOverviewRow[] = [];
    let sceneNumber = 0;

    for (let i = folderIndex + 1; i < elements.length; i++) {
      const element = elements[i];
      if (element.level <= folderLevel) break;

      const depth = element.level - folderLevel - 1;
      if (!options.deep && depth > 0) continue;

      const kind = kindOf(element);
      if (options.proseOnly && kind === 'other') continue;

      const scene = readSceneMetadata(element.metadata);
      const row: SceneOverviewRow = {
        element,
        depth,
        kind,
        scene,
        ...(links.get(element.id) ?? NO_LINKS),
        storyDateLabel: this.storyDateLabel(scene),
        words: 0,
        wordsState: 'none',
        wordTarget: 0,
        progress: null,
        sceneNumber: kind === 'scene' ? ++sceneNumber : null,
        sceneCount: 0,
      };

      this.fillWords(row, elements, i, counts);
      rows.push(row);
    }
    return rows;
  }

  /** Totals over every scene below `folderId`, however deeply nested. */
  totals(folderId: string): SceneOverviewTotals {
    const totals: SceneOverviewTotals = {
      scenes: 0,
      words: 0,
      wordTarget: 0,
      wordsState: 'none',
      byStatus: { idea: 0, draft: 0, revised: 0, final: 0, none: 0 },
    };
    for (const row of this.rows(folderId, { deep: true, proseOnly: true })) {
      if (row.kind !== 'scene') continue;
      totals.scenes++;
      totals.words += row.words;
      totals.wordTarget += row.wordTarget;
      totals.wordsState = mergeState(totals.wordsState, row.wordsState);
      totals.byStatus[row.scene.status ?? 'none']++;
    }
    return totals;
  }

  /** True when the folder holds at least one scene, at any depth. */
  hasScenes(folderId: string): boolean {
    return this.rows(folderId, { deep: true, proseOnly: true }).some(
      r => r.kind === 'scene'
    );
  }

  /**
   * Re-read the word counts of every prose document below the folder.
   * Counts are cached for the life of the app, so a view calls this when it
   * opens to pick up whatever was written since.
   */
  refreshWordCounts(folderId: string): void {
    this.stats.recount([folderId]);
  }

  /** Count any document below the folder that has not been counted yet. */
  ensureWordCounts(folderId: string): void {
    this.stats.ensureCounted([folderId]);
  }

  /** Icon of a linked worldbuilding element (POV character, location). */
  linkIcon(element: Element): string {
    return (
      element.metadata?.['icon'] ||
      this.worldbuildingService.getSchemaIcon(element.schemaId)
    );
  }

  open(element: Element): void {
    this.projectState.openDocument(element);
  }

  setStatus(elementId: string, status: SceneStatus | null): void {
    if (!this.canWrite()) return;
    this.projectState.updateElementMetadata(
      elementId,
      sceneMetadataPatch({ status })
    );
  }

  setSynopsis(elementId: string, synopsis: string): void {
    if (!this.canWrite()) return;
    const element = this.projectState.elements().find(e => e.id === elementId);
    if (!element) return;
    const next = synopsis.trim();
    if (next === readSceneMetadata(element.metadata).synopsis) return;
    this.projectState.updateElementMetadata(
      elementId,
      sceneMetadataPatch({ synopsis: next })
    );
  }

  /** Turn a note or role-less document into a scene. */
  makeScene(elementId: string): void {
    if (!this.canWrite()) return;
    this.projectState.setDocumentRole(elementId, 'scene');
  }

  async openDetails(element: Element): Promise<void> {
    if (!this.canWrite()) return;
    const result = await this.dialogGateway.openSceneDetailsDialog({
      elementName: element.name,
      metadata: element.metadata ?? {},
      timeSystems: this.timeSystemLibrary.systems(),
    });
    if (!result) return;
    this.projectState.updateElementMetadata(element.id, result.patch);
  }

  /**
   * Move the direct child at `fromIndex` so it ends up at `toIndex` among
   * the folder's children. Its own descendants move with it.
   */
  moveChild(folderId: string, fromIndex: number, toIndex: number): void {
    if (!this.canWrite() || fromIndex === toIndex) return;
    const elements = this.projectState.elements();
    const folderIndex = elements.findIndex(e => e.id === folderId);
    if (folderIndex === -1) return;

    const childLevel = elements[folderIndex].level + 1;
    const children: number[] = [];
    let end = folderIndex + 1;
    for (; end < elements.length; end++) {
      if (elements[end].level < childLevel) break;
      if (elements[end].level === childLevel) children.push(end);
    }
    const moved = children[fromIndex];
    if (moved === undefined) return;

    // Insert before whichever sibling follows the new slot, or at the end
    // of the folder when it is dropped last.
    const others = children.filter(index => index !== moved);
    const target = others[toIndex] ?? end;
    this.projectState.moveElement(elements[moved].id, target, childLevel);
  }

  /** Set the word count, target and progress of a row. */
  private fillWords(
    row: SceneOverviewRow,
    elements: readonly Element[],
    index: number,
    counts: ReadonlyMap<string, WordCountEntry>
  ): void {
    if (row.kind === 'folder') {
      this.rollUpFolder(row, elements, index, counts);
    } else if (row.kind !== 'other') {
      const entry = counts.get(row.element.id);
      row.wordsState = stateOf(entry);
      row.words = entry?.status === 'ready' ? entry.words : 0;
      row.wordTarget = row.kind === 'scene' ? (row.scene.wordTarget ?? 0) : 0;
    }
    row.progress = progressOf(row.words, row.wordTarget);
  }

  private rollUpFolder(
    row: SceneOverviewRow,
    elements: readonly Element[],
    folderIndex: number,
    counts: ReadonlyMap<string, WordCountEntry>
  ): void {
    const level = elements[folderIndex].level;
    for (let i = folderIndex + 1; i < elements.length; i++) {
      const element = elements[i];
      if (element.level <= level) break;
      if (element.type !== ElementType.Item) continue;

      const entry = counts.get(element.id);
      row.wordsState = mergeState(row.wordsState, stateOf(entry));
      if (entry?.status === 'ready') row.words += entry.words;
      if (getDocumentRole(element.metadata) === 'scene') {
        row.sceneCount++;
        row.wordTarget += readSceneMetadata(element.metadata).wordTarget ?? 0;
      }
    }
  }

  /** Scene id → its POV characters and locations. */
  private sceneLinks(elements: readonly Element[]): Map<string, SceneLinks> {
    const byId = new Map(elements.map(e => [e.id, e]));
    const links = new Map<string, SceneLinks>();
    for (const rel of this.relationshipService.relationships()) {
      const isPov = rel.relationshipTypeId === SCENE_POV_RELATIONSHIP_TYPE;
      if (!isPov && rel.relationshipTypeId !== SCENE_LOCATION_RELATIONSHIP_TYPE)
        continue;
      const target = byId.get(rel.targetElementId);
      if (!target) continue;

      let entry = links.get(rel.sourceElementId);
      if (!entry) {
        entry = { pov: [], location: [] };
        links.set(rel.sourceElementId, entry);
      }
      (isPov ? entry.pov : entry.location).push(target);
    }
    return links;
  }

  private storyDateLabel(scene: SceneMetadata): string | null {
    const point = scene.storyDate;
    if (!point) return null;
    const system = this.timeSystemLibrary.resolveSystem(point.systemId);
    if (!system) return point.units.join('-');
    try {
      return formatTimePoint(point, system);
    } catch {
      return point.units.join('-');
    }
  }
}

function kindOf(element: Element): SceneOverviewKind {
  if (element.type === ElementType.Folder) return 'folder';
  if (element.type !== ElementType.Item) return 'other';
  return getDocumentRole(element.metadata) ?? 'document';
}

function stateOf(entry: WordCountEntry | undefined): WordCountState {
  return entry?.status ?? 'loading';
}

/** Combine two states: anything still loading or missing wins over ready. */
function mergeState(a: WordCountState, b: WordCountState): WordCountState {
  if (a === 'none') return b;
  if (b === 'none') return a;
  if (a === 'loading' || b === 'loading') return 'loading';
  if (a === 'unavailable' || b === 'unavailable') return 'unavailable';
  return 'ready';
}

function progressOf(words: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.min(100, Math.round((words / target) * 100));
}
