/**
 * Relationship Chart Service
 *
 * Builds graph data from the project's elements and relationships,
 * applying chart-specific filters. Manages chart configuration
 * persistence via element metadata.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { Element, ElementType } from '@inkweld/index';

import { RelationshipTypeDefinition } from '../../components/element-ref/element-ref.model';
import {
  ChartConfig,
  ChartEdge,
  ChartFilters,
  ChartGraphData,
  ChartLayout,
  ChartNode,
  createDefaultChartConfig,
} from '../../models/relationship-chart.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { RelationshipService } from '../relationship/relationship.service';

/** Key used to store serialized chart config in element metadata */
const CHART_CONFIG_META_KEY = 'chartConfig';

/** LocalStorage key prefix for chart viewport/positions */
const CHART_STATE_PREFIX = 'inkweld-chart-state:';

/**
 * Local-only display state saved to localStorage
 */
interface ChartLocalState {
  nodePositions?: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * NOT provided at root — each RelationshipChartTabComponent provides its own
 * instance so multiple chart tabs never share config state.
 */
@Injectable()
export class RelationshipChartService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);

  // ─────────────────────────────────────────────────────────────────────────
  // Active chart state
  // ─────────────────────────────────────────────────────────────────────────

  /** Currently active chart config, set when a chart tab is opened */
  private readonly activeConfigSignal = signal<ChartConfig | null>(null);
  readonly activeConfig = this.activeConfigSignal.asReadonly();

  /** Computed graph data derived from active config + project state */
  readonly graphData = computed<ChartGraphData | null>(() => {
    const config = this.activeConfigSignal();
    if (!config) return null;

    const elements = this.projectState.elements();
    const relationships = this.relationshipService.relationships();
    const types = this.relationshipService.allTypes();

    return this.buildGraph(elements, relationships, types, config.filters);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Config Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load or create a chart config for a given element.
   * Reads from element metadata if it exists, otherwise creates defaults.
   */
  loadConfig(elementId: string): ChartConfig {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === elementId);

    if (element?.metadata?.[CHART_CONFIG_META_KEY]) {
      try {
        const parsed = JSON.parse(
          element.metadata[CHART_CONFIG_META_KEY]
        ) as Partial<ChartConfig>;
        const config: ChartConfig = {
          ...createDefaultChartConfig(elementId),
          ...parsed,
          elementId, // Ensure elementId is always correct
        };
        this.logger.debug(
          'RelationshipChart',
          `loadConfig: restored config for ${elementId} (mode=${config.filters.mode}, ` +
            `elements=${config.filters.includedElementIds?.length ?? 0})`
        );
        this.activeConfigSignal.set(config);
        return config;
      } catch {
        this.logger.warn(
          'RelationshipChart',
          'Failed to parse chart config from metadata'
        );
      }
    }

    this.logger.debug(
      'RelationshipChart',
      `loadConfig: using defaults for ${elementId} ` +
        `(element ${element ? 'found' : 'not found'}, ${elements.length} elements loaded)`
    );
    const config = createDefaultChartConfig(elementId);
    this.activeConfigSignal.set(config);
    return config;
  }

  /**
   * Save chart config to element metadata (synced via Yjs).
   */
  saveConfig(config: ChartConfig): void {
    this.activeConfigSignal.set(config);

    // Serialize to element metadata (exclude nodePositions/viewport — those are local)
    const toSerialize: Partial<ChartConfig> = {
      layout: config.layout,
      filters: config.filters,
    };

    this.projectState.updateElementMetadata(config.elementId, {
      [CHART_CONFIG_META_KEY]: JSON.stringify(toSerialize),
    });
  }

  /**
   * Update chart layout and persist.
   */
  setLayout(layout: ChartLayout): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.saveConfig({ ...config, layout });
  }

  /**
   * Update chart filters and persist.
   */
  setFilters(filters: ChartFilters): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.saveConfig({ ...config, filters });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Element & Relationship Type Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add elements to the curated list.
   */
  addElements(elementIds: string[]): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    const existing = new Set(config.filters.includedElementIds ?? []);
    for (const id of elementIds) {
      existing.add(id);
    }
    this.setFilters({
      ...config.filters,
      mode: 'curated',
      includedElementIds: Array.from(existing),
    });
  }

  /**
   * Remove an element from the curated list.
   */
  removeElement(elementId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.setFilters({
      ...config.filters,
      includedElementIds: (config.filters.includedElementIds ?? []).filter(
        id => id !== elementId
      ),
    });
  }

  /**
   * Toggle a relationship type filter. When `relationshipTypeIds` is empty
   * all types are shown. Adding an ID restricts to only that set.
   */
  toggleRelationshipType(typeId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    const current = config.filters.relationshipTypeIds ?? [];
    const included = current.includes(typeId);
    this.setFilters({
      ...config.filters,
      relationshipTypeIds: included
        ? current.filter(id => id !== typeId)
        : [...current, typeId],
    });
  }

  /**
   * Set chart mode (curated vs. all).
   */
  setMode(mode: 'all' | 'curated'): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.setFilters({
      ...config.filters,
      mode,
      // In 'all' mode, show orphans so everything appears
      ...(mode === 'all' ? { showOrphans: true } : {}),
    });
  }

  /**
   * Set or clear the focus element (BFS depth-limited view).
   * Pass null to disable focus mode.
   */
  setFocusElement(elementId: string | null, maxDepth = 3): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.setFilters({
      ...config.filters,
      focusElementId: elementId ?? undefined,
      maxDepth: elementId != null ? maxDepth : undefined,
    });
  }

  /**
   * Clear the active config (when chart tab is closed).
   */
  clearActiveConfig(): void {
    this.activeConfigSignal.set(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local State (viewport/positions → localStorage)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Save local-only state (node positions, viewport) to localStorage.
   */
  saveLocalState(elementId: string, state: ChartLocalState): void {
    try {
      localStorage.setItem(
        CHART_STATE_PREFIX + elementId,
        JSON.stringify(state)
      );
    } catch {
      // localStorage might be full or disabled
    }
  }

  /**
   * Load local-only state from localStorage.
   */
  loadLocalState(elementId: string): ChartLocalState | null {
    try {
      const raw = localStorage.getItem(CHART_STATE_PREFIX + elementId);
      return raw ? (JSON.parse(raw) as ChartLocalState) : null;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Graph Building
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build graph data from project elements and relationships,
   * applying the given filters.
   */
  buildGraph(
    elements: Element[],
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    types: RelationshipTypeDefinition[],
    filters: ChartFilters
  ): ChartGraphData {
    const typeMap = new Map(types.map(t => [t.id, t]));

    // 1. Filter relationships by type
    let filteredRelationships = relationships;
    if (filters.relationshipTypeIds.length > 0) {
      const typeIdSet = new Set(filters.relationshipTypeIds);
      filteredRelationships = filteredRelationships.filter(r =>
        typeIdSet.has(r.relationshipTypeId)
      );
    }

    // 2. Collect element IDs that participate in relationships
    const relatedIds = new Set<string>();
    for (const rel of filteredRelationships) {
      relatedIds.add(rel.sourceElementId);
      relatedIds.add(rel.targetElementId);
    }

    // 3. Filter elements
    const isCurated =
      filters.mode === 'curated' && !!filters.includedElementIds?.length;
    const includedIdSet = isCurated
      ? new Set(filters.includedElementIds)
      : null;

    let filteredElements = elements.filter(e => {
      // Skip folders — they're structural, not content
      if (e.type === ElementType.Folder) return false;

      // Skip other chart elements
      if (e.type === ElementType.RelationshipChart) return false;

      // In curated mode, only include explicitly selected elements
      if (includedIdSet) {
        return includedIdSet.has(e.id);
      }

      // --- 'all' mode filters below ---

      // Apply element type filter
      if (
        filters.elementTypes.length > 0 &&
        !filters.elementTypes.includes(e.type)
      ) {
        return false;
      }

      // Apply schema filter (for worldbuilding elements)
      if (filters.schemaIds.length > 0) {
        if (e.type === ElementType.Worldbuilding && e.schemaId) {
          if (!filters.schemaIds.includes(e.schemaId)) return false;
        }
      }

      // Include orphans only if showOrphans is true
      if (!filters.showOrphans && !relatedIds.has(e.id)) {
        return false;
      }

      return true;
    });

    // 4. Apply focus mode (BFS from focus element)
    if (filters.focusElementId) {
      filteredElements = this.filterByFocus(
        filteredElements,
        filteredRelationships,
        filters.focusElementId,
        filters.maxDepth ?? 3
      );
    }

    // 5. Build element ID set for edge filtering
    const elementIdSet = new Set(filteredElements.map(e => e.id));

    // 5b. Pre-compute relationship counts per element (avoids O(n²))
    const relationshipCountMap = new Map<string, number>();
    for (const r of filteredRelationships) {
      relationshipCountMap.set(
        r.sourceElementId,
        (relationshipCountMap.get(r.sourceElementId) ?? 0) + 1
      );
      relationshipCountMap.set(
        r.targetElementId,
        (relationshipCountMap.get(r.targetElementId) ?? 0) + 1
      );
    }

    // 6. Build nodes
    const nodes: ChartNode[] = filteredElements.map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      schemaId: e.schemaId,
      icon: e.metadata?.['icon'],
      relationshipCount: relationshipCountMap.get(e.id) ?? 0,
      category: this.getCategoryLabel(e),
    }));

    // 7. Build edges (only between included nodes)
    const edges: ChartEdge[] = filteredRelationships
      .filter(
        r =>
          elementIdSet.has(r.sourceElementId) &&
          elementIdSet.has(r.targetElementId)
      )
      .map(r => {
        const type = typeMap.get(r.relationshipTypeId);
        return {
          source: r.sourceElementId,
          target: r.targetElementId,
          relationshipTypeId: r.relationshipTypeId,
          label: type?.name ?? r.relationshipTypeId,
          color: type?.color,
          note: r.note,
          relationshipId: r.id,
        };
      });

    return { nodes, edges };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * BFS traversal to collect elements within maxDepth hops from a focus element.
   */
  private filterByFocus(
    elements: Element[],
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    focusId: string,
    maxDepth: number
  ): Element[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: focusId, depth: 0 },
    ];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      if (depth < maxDepth) {
        // Find neighbors (both directions)
        for (const rel of relationships) {
          if (rel.sourceElementId === id && !visited.has(rel.targetElementId)) {
            queue.push({ id: rel.targetElementId, depth: depth + 1 });
          }
          if (rel.targetElementId === id && !visited.has(rel.sourceElementId)) {
            queue.push({ id: rel.sourceElementId, depth: depth + 1 });
          }
        }
      }
    }

    return elements.filter(e => visited.has(e.id));
  }

  /**
   * Derive a human-readable category label for an element
   * (used for legend grouping in the chart).
   */
  private getCategoryLabel(element: Element): string {
    if (element.type === ElementType.Worldbuilding && element.schemaId) {
      // Convert schema IDs like 'character-v1' to 'Character'
      const name = element.schemaId
        .replace(/-v\d+$/, '') // Remove version suffix
        .replace(/-/g, ' ') // Replace dashes with spaces
        .replace(/\b\w/g, c => c.toUpperCase()); // Title case
      return name;
    }
    if (element.type === ElementType.Item) return 'Document';
    return String(element.type);
  }
}
