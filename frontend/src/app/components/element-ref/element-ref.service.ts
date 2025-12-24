/**
 * Element Reference Service
 *
 * Handles searching for elements and coordinating the @ reference popup.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';
import type { EditorView } from 'prosemirror-view';

import { LoggerService } from '../../services/core/logger.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import {
  ElementRefClickEvent,
  ElementRefNodeAttrs,
  ElementSearchResult,
} from './element-ref.model';
import { ElementRefTooltipData } from './element-ref-tooltip/element-ref-tooltip.component';

/**
 * Default icons for element types
 */
const ELEMENT_TYPE_ICONS: Record<string, string> = {
  [ElementType.Folder]: 'folder',
  [ElementType.Item]: 'description',
  [ElementType.Worldbuilding]: 'category',
};

@Injectable({
  providedIn: 'root',
})
export class ElementRefService {
  private logger = inject(LoggerService);
  private projectState = inject(ProjectStateService);
  private worldbuildingService = inject(WorldbuildingService);

  /** Current search query */
  private searchQuerySignal = signal('');
  readonly searchQuery = this.searchQuerySignal.asReadonly();

  /** Whether the popup is currently open */
  private isPopupOpenSignal = signal(false);
  readonly isPopupOpen = this.isPopupOpenSignal.asReadonly();

  /** Current popup position */
  private popupPositionSignal = signal<{ x: number; y: number } | null>(null);
  readonly popupPosition = this.popupPositionSignal.asReadonly();

  /** Current editor view for element ref operations */
  private editorViewSignal = signal<EditorView | null>(null);
  readonly editorView = this.editorViewSignal.asReadonly();

  /** Current click event for context menu */
  private clickEventSignal = signal<ElementRefClickEvent | null>(null);
  readonly clickEvent = this.clickEventSignal.asReadonly();

  /** Current tooltip data for hover display */
  private tooltipDataSignal = signal<ElementRefTooltipData | null>(null);
  readonly tooltipData = this.tooltipDataSignal.asReadonly();

  /** Filtered search results */
  readonly searchResults = computed(() => {
    const query = this.searchQuerySignal().toLowerCase().trim();
    const elements = this.projectState.elements();

    if (!query) {
      // Return first 10 elements when no query
      return this.rankAndLimitResults(elements, '', 10);
    }

    // Filter elements by query
    const filtered = elements.filter(element => {
      const nameMatch = element.name.toLowerCase().includes(query);
      const typeMatch = element.type.toLowerCase().includes(query);
      return nameMatch || typeMatch;
    });

    return this.rankAndLimitResults(filtered, query, 10);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Search Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Search for elements matching a query
   */
  searchElements(
    query: string,
    options?: {
      limit?: number;
      types?: ElementType[];
      excludeIds?: string[];
    }
  ): ElementSearchResult[] {
    const elements = this.projectState.elements();
    const normalizedQuery = query.toLowerCase().trim();
    const limit = options?.limit ?? 10;

    let filtered = elements;

    // Apply type filter
    if (options?.types?.length) {
      filtered = filtered.filter(e => options.types!.includes(e.type));
    }

    // Apply exclusion filter
    if (options?.excludeIds?.length) {
      filtered = filtered.filter(e => !options.excludeIds!.includes(e.id));
    }

    // Apply text filter
    if (normalizedQuery) {
      filtered = filtered.filter(element => {
        const nameMatch = element.name.toLowerCase().includes(normalizedQuery);
        const typeMatch = element.type.toLowerCase().includes(normalizedQuery);
        return nameMatch || typeMatch;
      });
    }

    return this.rankAndLimitResults(filtered, normalizedQuery, limit);
  }

  /**
   * Rank results by relevance and convert to search results
   */
  private rankAndLimitResults(
    elements: Element[],
    query: string,
    limit: number
  ): ElementSearchResult[] {
    const scored = elements.map(element => ({
      element,
      score: this.calculateMatchScore(element, query),
    }));

    // Sort by score (higher is better), then by name
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.element.name.localeCompare(b.element.name);
    });

    return scored.slice(0, limit).map(({ element, score }) => ({
      element: {
        id: element.id,
        name: element.name,
        type: element.type,
      },
      icon: this.getElementIcon(element),
      path: this.buildElementPath(element),
      score,
    }));
  }

  /**
   * Calculate a relevance score for an element
   */
  private calculateMatchScore(element: Element, query: string): number {
    if (!query) return 0;

    const name = element.name.toLowerCase();
    let score = 0;

    // Exact match gets highest score
    if (name === query) {
      score += 100;
    }
    // Starts with query
    else if (name.startsWith(query)) {
      score += 75;
    }
    // Contains query
    else if (name.includes(query)) {
      score += 50;
    }

    // Boost documents (more likely to be referenced)
    if (element.type === ElementType.Item) {
      score += 5;
    }

    // Boost worldbuilding elements (commonly referenced)
    if (element.type === ElementType.Worldbuilding) {
      score += 10;
    }

    return score;
  }

  /**
   * Get the icon for an element
   */
  getElementIcon(element: Element): string {
    // Check for custom icon in metadata
    if (element.metadata?.['icon']) {
      return element.metadata['icon'];
    }

    // For WORLDBUILDING elements, look up schema icon
    if (element.type === ElementType.Worldbuilding && element.schemaId) {
      const project = this.projectState.project();
      const projectKey = project
        ? `${project.username}/${project.slug}`
        : 'unknown';
      const schema = this.worldbuildingService.getSchemaFromLibrary(
        projectKey,
        element.schemaId,
        project?.username,
        project?.slug
      );
      if (schema?.icon) {
        return schema.icon;
      }
    }

    // Use default icon for type
    return ELEMENT_TYPE_ICONS[element.type] || 'description';
  }

  /**
   * Get the default icon for an element type (without needing the full element)
   * Used as a fallback when the element can't be resolved
   */
  getDefaultIconForType(type: ElementType | string): string {
    return ELEMENT_TYPE_ICONS[type] || 'description';
  }

  /**
   * Format element type for display (e.g., FOLDER -> Folder)
   */
  formatElementType(type: ElementType | string): string {
    const typeMap: Record<string, string> = {
      [ElementType.Item]: 'Document',
      [ElementType.Folder]: 'Folder',
      [ElementType.Worldbuilding]: 'Worldbuilding',
    };
    return (
      typeMap[type] ||
      String(type)
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    );
  }

  /**
   * Build a breadcrumb path for an element
   */
  private buildElementPath(element: Element): string {
    const elements = this.projectState.elements();
    const path: string[] = [];

    let currentId = element.parentId;
    while (currentId) {
      const parent = elements.find(e => e.id === currentId);
      if (parent) {
        path.unshift(parent.name);
        currentId = parent.parentId;
      } else {
        break;
      }
    }

    return path.length > 0 ? path.join(' / ') : '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Popup Control
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Open the element reference popup
   */
  openPopup(position: { x: number; y: number }, initialQuery = ''): void {
    this.popupPositionSignal.set(position);
    this.searchQuerySignal.set(initialQuery);
    this.isPopupOpenSignal.set(true);

    this.logger.debug(
      'ElementRefService',
      `Opened popup at (${position.x}, ${position.y}) with query "${initialQuery}"`
    );
  }

  /**
   * Close the element reference popup
   */
  closePopup(): void {
    this.isPopupOpenSignal.set(false);
    this.popupPositionSignal.set(null);
    this.searchQuerySignal.set('');

    this.logger.debug('ElementRefService', 'Closed popup');
  }

  /**
   * Update the search query
   */
  setSearchQuery(query: string): void {
    this.searchQuerySignal.set(query);
  }

  /**
   * Set the current editor view for element ref operations
   */
  setEditorView(view: EditorView | null): void {
    this.editorViewSignal.set(view);
  }

  /**
   * Handle element ref click (for context menu or navigation)
   */
  handleRefClick(event: ElementRefClickEvent): void {
    this.clickEventSignal.set(event);
    this.logger.debug(
      'ElementRefService',
      `Element ref clicked: ${event.elementId}, isContextMenu: ${event.isContextMenu}`
    );
  }

  /**
   * Clear the click event (after handling)
   */
  clearClickEvent(): void {
    this.clickEventSignal.set(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tooltip Control
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Show tooltip for an element reference
   */
  showTooltip(data: ElementRefTooltipData): void {
    this.tooltipDataSignal.set(data);
  }

  /**
   * Hide the tooltip
   */
  hideTooltip(): void {
    this.tooltipDataSignal.set(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Element Ref Node Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create node attributes for an element reference
   */
  createNodeAttrs(
    element: { id: string; name: string; type: ElementType },
    options?: {
      displayText?: string;
      relationshipTypeId?: string;
      relationshipNote?: string;
      relationshipId?: string;
    }
  ): ElementRefNodeAttrs {
    return {
      elementId: element.id,
      elementType: element.type,
      displayText: options?.displayText ?? element.name,
      originalName: element.name,
      relationshipTypeId: options?.relationshipTypeId ?? 'referenced-in',
      relationshipNote: options?.relationshipNote,
      relationshipId: options?.relationshipId,
    };
  }

  /**
   * Get element by ID
   */
  getElementById(elementId: string): Element | undefined {
    return this.projectState.elements().find(e => e.id === elementId);
  }

  /**
   * Check if an element still exists (for detecting deleted refs)
   */
  elementExists(elementId: string): boolean {
    return this.projectState.elements().some(e => e.id === elementId);
  }

  /**
   * Check if an element's name has changed from stored original
   */
  hasElementNameChanged(elementId: string, originalName: string): boolean {
    const element = this.getElementById(elementId);
    if (!element) return true; // Deleted = definitely changed
    return element.name !== originalName;
  }
}
