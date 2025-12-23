/**
 * Tag Service
 *
 * Manages CRUD operations for element tags using centralized
 * storage in the project elements Yjs document.
 *
 * Tags are stored centrally, enabling:
 * - Fast queries for elements with specific tags
 * - Tag index with counts for UI display
 * - Custom tag definitions per project
 * - Real-time sync via Yjs
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { nanoid } from 'nanoid';

import {
  ElementTag,
  ElementTagView,
  ResolvedTag,
  TagDefinition,
  TagIndexEntry,
} from '../../components/tags/tag.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { ElementSyncProviderFactory } from '../sync/element-sync-provider.factory';

@Injectable({
  providedIn: 'root',
})
export class TagService {
  private logger = inject(LoggerService);
  private projectState = inject(ProjectStateService);
  private syncProviderFactory = inject(ElementSyncProviderFactory);

  /** Get the active sync provider */
  private get syncProvider() {
    return this.syncProviderFactory.getProvider();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Signals
  // ─────────────────────────────────────────────────────────────────────────

  /** All element tags in the project (reactive) */
  private elementTagsSignal = signal<ElementTag[]>([]);
  readonly elementTags = this.elementTagsSignal.asReadonly();

  /** Custom tag definitions from the project */
  private customTagsSignal = signal<TagDefinition[]>([]);
  readonly customTags = this.customTagsSignal.asReadonly();

  /** All available tag definitions (project-local) */
  readonly allTags = computed(() => {
    return this.customTagsSignal();
  });

  /** Tag index with counts per tag */
  readonly tagIndex = computed(() => {
    const tags = this.elementTagsSignal();
    const definitions = this.allTags();
    const indexMap = new Map<string, TagIndexEntry>();

    // Initialize all definitions with zero counts
    for (const def of definitions) {
      indexMap.set(def.id, {
        definition: def,
        count: 0,
        elementIds: [],
      });
    }

    // Count element tags
    for (const tag of tags) {
      const entry = indexMap.get(tag.tagId);
      if (entry) {
        entry.count++;
        entry.elementIds.push(tag.elementId);
      }
    }

    return Array.from(indexMap.values());
  });

  constructor() {
    // Subscribe to element tags from sync provider
    this.syncProvider.elementTags$.subscribe(tags => {
      this.elementTagsSignal.set(tags);
    });

    // Subscribe to custom tags from sync provider
    this.syncProvider.customTags$.subscribe(tags => {
      this.customTagsSignal.set(tags);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tag Assignment CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all element tags in the project
   */
  getAllElementTags(): ElementTag[] {
    return this.syncProvider.getElementTags();
  }

  /**
   * Get all tags for a specific element
   */
  getTagsForElement(elementId: string): ElementTag[] {
    return this.syncProvider
      .getElementTags()
      .filter(t => t.elementId === elementId);
  }

  /**
   * Get resolved tags for an element (with definitions)
   * Uses reactive signals to ensure computed values update on tag changes.
   */
  getResolvedTagsForElement(elementId: string): ResolvedTag[] {
    // Read from signals to ensure reactivity in computed() contexts
    const tags = this.elementTagsSignal().filter(
      t => t.elementId === elementId
    );
    const customTags = this.customTagsSignal();

    return tags
      .map(assignment => {
        const definition = customTags.find(t => t.id === assignment.tagId);
        if (!definition) return null;
        return { assignment, definition };
      })
      .filter((t): t is ResolvedTag => t !== null);
  }

  /**
   * Get the complete tag view for an element
   */
  getElementTagView(elementId: string): ElementTagView {
    return {
      elementId,
      tags: this.getResolvedTagsForElement(elementId),
    };
  }

  /**
   * Get all elements with a specific tag
   */
  getElementsWithTag(tagId: string): string[] {
    return this.syncProvider
      .getElementTags()
      .filter(t => t.tagId === tagId)
      .map(t => t.elementId);
  }

  /**
   * Check if an element has a specific tag
   */
  hasTag(elementId: string, tagId: string): boolean {
    return this.syncProvider
      .getElementTags()
      .some(t => t.elementId === elementId && t.tagId === tagId);
  }

  /**
   * Add a tag to an element
   */
  addTag(elementId: string, tagId: string): ElementTag {
    // Check if tag already exists
    if (this.hasTag(elementId, tagId)) {
      this.logger.warn(
        'TagService',
        `Element ${elementId} already has tag ${tagId}`
      );
      const existing = this.syncProvider
        .getElementTags()
        .find(t => t.elementId === elementId && t.tagId === tagId);
      return existing!;
    }

    const now = new Date().toISOString();
    const elementTag: ElementTag = {
      id: nanoid(),
      elementId,
      tagId,
      createdAt: now,
    };

    const tags = [...this.syncProvider.getElementTags(), elementTag];
    this.syncProvider.updateElementTags(tags);

    this.logger.debug(
      'TagService',
      `Added tag ${tagId} to element ${elementId}`
    );

    return elementTag;
  }

  /**
   * Remove a tag from an element
   */
  removeTag(elementId: string, tagId: string): boolean {
    const tags = this.syncProvider.getElementTags();
    const index = tags.findIndex(
      t => t.elementId === elementId && t.tagId === tagId
    );

    if (index === -1) {
      this.logger.warn(
        'TagService',
        `Tag ${tagId} not found on element ${elementId}`
      );
      return false;
    }

    const newTags = [...tags];
    newTags.splice(index, 1);
    this.syncProvider.updateElementTags(newTags);

    this.logger.debug(
      'TagService',
      `Removed tag ${tagId} from element ${elementId}`
    );

    return true;
  }

  /**
   * Remove a tag assignment by ID
   */
  removeTagById(assignmentId: string): boolean {
    const tags = this.syncProvider.getElementTags();
    const index = tags.findIndex(t => t.id === assignmentId);

    if (index === -1) {
      this.logger.warn(
        'TagService',
        `Tag assignment ${assignmentId} not found`
      );
      return false;
    }

    const newTags = [...tags];
    newTags.splice(index, 1);
    this.syncProvider.updateElementTags(newTags);

    return true;
  }

  /**
   * Set all tags for an element (replaces existing)
   */
  setElementTags(elementId: string, tagIds: string[]): void {
    const now = new Date().toISOString();
    const otherTags = this.syncProvider
      .getElementTags()
      .filter(t => t.elementId !== elementId);

    const newTags: ElementTag[] = tagIds.map(tagId => ({
      id: nanoid(),
      elementId,
      tagId,
      createdAt: now,
    }));

    this.syncProvider.updateElementTags([...otherTags, ...newTags]);

    this.logger.debug(
      'TagService',
      `Set ${tagIds.length} tags for element ${elementId}`
    );
  }

  /**
   * Remove all tags from an element
   */
  clearElementTags(elementId: string): void {
    const tags = this.syncProvider
      .getElementTags()
      .filter(t => t.elementId !== elementId);
    this.syncProvider.updateElementTags(tags);

    this.logger.debug(
      'TagService',
      `Cleared all tags from element ${elementId}`
    );
  }

  /**
   * Remove all occurrences of a tag (when deleting a tag definition)
   */
  removeAllTagOccurrences(tagId: string): number {
    const tags = this.syncProvider.getElementTags();
    const remaining = tags.filter(t => t.tagId !== tagId);
    const removedCount = tags.length - remaining.length;

    if (removedCount > 0) {
      this.syncProvider.updateElementTags(remaining);
      this.logger.debug(
        'TagService',
        `Removed ${removedCount} occurrences of tag ${tagId}`
      );
    }

    return removedCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Custom Tag Definition CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all custom tag definitions
   */
  getCustomTagDefinitions(): TagDefinition[] {
    return this.syncProvider.getCustomTags();
  }

  /**
   * Get a tag definition by ID
   */
  getTagDefinition(tagId: string): TagDefinition | undefined {
    return this.syncProvider.getCustomTags().find(t => t.id === tagId);
  }

  /**
   * Create a new custom tag definition
   */
  createCustomTag(tag: Omit<TagDefinition, 'id'>): TagDefinition {
    const newTag: TagDefinition = {
      ...tag,
      id: nanoid(),
    };

    const tags = [...this.syncProvider.getCustomTags(), newTag];
    this.syncProvider.updateCustomTags(tags);

    this.logger.debug('TagService', `Created custom tag: ${newTag.name}`);

    return newTag;
  }

  /**
   * Update a tag definition
   */
  updateCustomTag(
    tagId: string,
    updates: Partial<Omit<TagDefinition, 'id'>>
  ): TagDefinition | null {
    const tags = this.syncProvider.getCustomTags();
    const index = tags.findIndex(t => t.id === tagId);

    if (index === -1) {
      this.logger.warn('TagService', `Tag ${tagId} not found`);
      return null;
    }

    const existing = tags[index];
    const updated: TagDefinition = {
      ...existing,
      ...updates,
    };

    const newTags = [...tags];
    newTags[index] = updated;
    this.syncProvider.updateCustomTags(newTags);

    this.logger.debug('TagService', `Updated custom tag: ${updated.name}`);

    return updated;
  }

  /**
   * Delete a tag definition (also removes all assignments)
   */
  deleteCustomTag(tagId: string): boolean {
    const tags = this.syncProvider.getCustomTags();
    const tag = tags.find(t => t.id === tagId);

    if (!tag) {
      this.logger.warn('TagService', `Tag ${tagId} not found`);
      return false;
    }

    // Remove all assignments of this tag
    this.removeAllTagOccurrences(tagId);

    // Remove the definition
    const newTags = tags.filter(t => t.id !== tagId);
    this.syncProvider.updateCustomTags(newTags);

    this.logger.debug('TagService', `Deleted custom tag: ${tag.name}`);

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the count of elements with a specific tag
   */
  getTagCount(tagId: string): number {
    return this.syncProvider.getElementTags().filter(t => t.tagId === tagId)
      .length;
  }

  /**
   * Search for tags by name (for autocomplete)
   */
  searchTags(query: string): TagDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.allTags().filter(t =>
      t.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get tags not yet assigned to an element (for add tag UI)
   * Uses reactive signals to ensure computed values update on tag changes.
   */
  getAvailableTagsForElement(elementId: string): TagDefinition[] {
    const existingTagIds = new Set(
      this.elementTagsSignal()
        .filter(t => t.elementId === elementId)
        .map(t => t.tagId)
    );
    return this.allTags().filter(t => !existingTagIds.has(t.id));
  }
}
