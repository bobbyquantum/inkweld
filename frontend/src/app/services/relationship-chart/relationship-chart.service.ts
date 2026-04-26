/**
 * Relationship Chart Service
 *
 * Builds graph data from the project's elements and relationships,
 * applying chart-specific filters. Manages chart configuration
 * persistence via element metadata.
 */

import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';

import { type RelationshipTypeDefinition } from '../../components/element-ref/element-ref.model';
import {
  type ChartConfig,
  type ChartEdge,
  type ChartFilters,
  type ChartGraphData,
  type ChartLayout,
  type ChartNode,
  createDefaultChartConfig,
} from '../../models/relationship-chart.model';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { ProjectStateService } from '../project/project-state.service';
import { RelationshipService } from '../relationship/relationship.service';

/** Key used to store serialized chart config in element metadata */
const CHART_CONFIG_META_KEY = 'chartConfig';

/** LocalStorage key prefix for chart viewport/positions */
const CHART_STATE_BASE_PREFIX = 'inkweld-chart-state:';

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
  private readonly storageContext = inject(StorageContextService);

  // ─────────────────────────────────────────────────────────────────────────
  // Active chart state
  // ─────────────────────────────────────────────────────────────────────────

  /** Currently active chart config, set when a chart tab is opened */
  private readonly activeConfigSignal = signal<ChartConfig | null>(null);
  readonly activeConfig = this.activeConfigSignal.asReadonly();

  /** ID of the element whose config is mirrored into `activeConfigSignal`. */
  private readonly boundElementId = signal<string | null>(null);

  /** Skip re-parse when the elements signal re-emits our own serialized write. */
  private lastAppliedSerialized: string | null = null;

  constructor() {
    // React to remote updates to the bound element's chartConfig. Without
    // this, a collaborator's filter/layout change silently lands in the
    // project elements but never re-renders our chart.
    effect(() => {
      const id = this.boundElementId();
      if (!id) return;
      const elements = this.projectState.elements();
      const element = elements.find(e => e.id === id);
      const serialized = element?.metadata?.[CHART_CONFIG_META_KEY] ?? null;
      if (serialized === this.lastAppliedSerialized) return;
      untracked(() => {
        this.lastAppliedSerialized = serialized;
        if (serialized) {
          const parsed = this.tryParseConfig(serialized, id);
          if (parsed) {
            this.activeConfigSignal.set(parsed);
            return;
          }
        }
        this.activeConfigSignal.set(createDefaultChartConfig(id));
      });
    });
  }

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
    const rawConfig = element?.metadata?.[CHART_CONFIG_META_KEY] ?? null;
    this.lastAppliedSerialized = rawConfig;

    if (rawConfig) {
      const parsed = this.tryParseConfig(rawConfig, elementId);
      if (parsed) {
        this.activeConfigSignal.set(parsed);
        this.boundElementId.set(elementId);
        return parsed;
      }
    }

    this.logger.debug(
      'RelationshipChart',
      `loadConfig: using defaults for ${elementId} ` +
        `(element ${element ? 'found' : 'not found'}, ${elements.length} elements loaded)`
    );
    const config = createDefaultChartConfig(elementId);
    this.activeConfigSignal.set(config);
    this.boundElementId.set(elementId);
    return config;
  }

  private tryParseConfig(
    rawConfig: string,
    elementId: string
  ): ChartConfig | null {
    try {
      const parsed = JSON.parse(rawConfig) as Partial<ChartConfig>;
      const defaults = createDefaultChartConfig(elementId);
      const filters = parsed.filters
        ? {
            ...defaults.filters,
            ...this.sanitizeFilters(parsed.filters, defaults.filters),
          }
        : defaults.filters;
      const config: ChartConfig = {
        ...defaults,
        ...parsed,
        filters,
        elementId,
      };
      this.logger.debug(
        'RelationshipChart',
        `loadConfig: restored config for ${elementId} (mode=${config.filters.mode}, ` +
          `elements=${config.filters.includedElementIds?.length ?? 0})`
      );
      return config;
    } catch {
      this.logger.warn(
        'RelationshipChart',
        'Failed to parse chart config from metadata'
      );
      return null;
    }
  }

  private sanitizeFilters(
    parsed: Partial<ChartFilters>,
    defaults: ChartFilters
  ): Partial<ChartFilters> {
    const sanitized: Partial<ChartFilters> = {};
    const defaultsRecord = defaults as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      const defaultValue = defaultsRecord[key];
      if (Array.isArray(defaultValue)) {
        sanitized[key as keyof ChartFilters] = Array.isArray(value)
          ? (value as never)
          : (defaultValue as never);
      } else {
        sanitized[key as keyof ChartFilters] = value as never;
      }
    }
    return sanitized;
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
    const serialized = JSON.stringify(toSerialize);
    this.lastAppliedSerialized = serialized;

    this.projectState.updateElementMetadata(config.elementId, {
      [CHART_CONFIG_META_KEY]: serialized,
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
      maxDepth: elementId == null ? undefined : maxDepth,
    });
  }

  /**
   * Clear the active config (when chart tab is closed).
   */
  clearActiveConfig(): void {
    this.activeConfigSignal.set(null);
    this.boundElementId.set(null);
    this.lastAppliedSerialized = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local State (viewport/positions → localStorage)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Save local-only state (node positions, viewport) to localStorage.
   */
  saveLocalState(elementId: string, state: ChartLocalState): void {
    try {
      const key = this.storageContext.prefixKey(
        CHART_STATE_BASE_PREFIX + elementId
      );
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // localStorage might be full or disabled
    }
  }

  /**
   * Load local-only state from localStorage.
   */
  loadLocalState(elementId: string): ChartLocalState | null {
    try {
      const key = this.storageContext.prefixKey(
        CHART_STATE_BASE_PREFIX + elementId
      );
      const raw = localStorage.getItem(key);
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
    const filteredRelationships = this.filterRelationshipsByType(
      relationships,
      filters.relationshipTypeIds
    );
    const relatedIds = this.collectRelatedIds(filteredRelationships);
    const filteredElements = this.filterElements(
      elements,
      filteredRelationships,
      relatedIds,
      filters
    );
    const elementIdSet = new Set(filteredElements.map(e => e.id));
    const relationshipCountMap = this.buildRelationshipCountMap(
      filteredRelationships,
      elementIdSet
    );
    const nodes = this.buildNodes(filteredElements, relationshipCountMap);
    const edges = this.buildEdges(filteredRelationships, elementIdSet, typeMap);

    return { nodes, edges };
  }

  private filterRelationshipsByType(
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    relationshipTypeIds: string[]
  ): ReturnType<RelationshipService['getAllRelationships']> {
    if (relationshipTypeIds.length === 0) {
      return relationships;
    }

    const typeIdSet = new Set(relationshipTypeIds);
    return relationships.filter(relationship =>
      typeIdSet.has(relationship.relationshipTypeId)
    );
  }

  private collectRelatedIds(
    relationships: ReturnType<RelationshipService['getAllRelationships']>
  ): Set<string> {
    const relatedIds = new Set<string>();
    for (const relationship of relationships) {
      relatedIds.add(relationship.sourceElementId);
      relatedIds.add(relationship.targetElementId);
    }
    return relatedIds;
  }

  private filterElements(
    elements: Element[],
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    relatedIds: Set<string>,
    filters: ChartFilters
  ): Element[] {
    const filteredElements = elements.filter(
      element =>
        element.id === filters.focusElementId ||
        this.shouldIncludeElement(element, relatedIds, filters)
    );

    if (!filters.focusElementId) {
      return filteredElements;
    }

    const filteredElementIds = new Set(
      filteredElements.map(element => element.id)
    );

    // Guard: if focusElementId refers to a deleted/missing element, skip focus filtering
    if (!filteredElementIds.has(filters.focusElementId)) {
      return filteredElements;
    }

    const visibleRelationships = relationships.filter(
      relationship =>
        filteredElementIds.has(relationship.sourceElementId) &&
        filteredElementIds.has(relationship.targetElementId)
    );

    return this.filterByFocus(
      filteredElements,
      visibleRelationships,
      filters.focusElementId,
      filters.maxDepth ?? 3
    );
  }

  private shouldIncludeElement(
    element: Element,
    relatedIds: Set<string>,
    filters: ChartFilters
  ): boolean {
    if (this.isNonGraphElement(element)) {
      return false;
    }

    if (this.hasCuratedSelection(filters)) {
      return new Set(filters.includedElementIds).has(element.id);
    }

    if (
      filters.elementTypes.length > 0 &&
      !filters.elementTypes.includes(element.type)
    ) {
      return false;
    }

    if (!this.matchesSchemaFilter(element, filters.schemaIds)) {
      return false;
    }

    return filters.showOrphans || relatedIds.has(element.id);
  }

  private isNonGraphElement(element: Element): boolean {
    return (
      element.type === ElementType.Folder ||
      element.type === ElementType.RelationshipChart ||
      element.type === ElementType.Canvas ||
      element.type === ElementType.Timeline
    );
  }

  private hasCuratedSelection(filters: ChartFilters): boolean {
    return filters.mode === 'curated' && !!filters.includedElementIds?.length;
  }

  private matchesSchemaFilter(element: Element, schemaIds: string[]): boolean {
    if (schemaIds.length === 0) {
      return true;
    }

    if (element.type !== ElementType.Worldbuilding || !element.schemaId) {
      return true;
    }

    return schemaIds.includes(element.schemaId);
  }

  private buildRelationshipCountMap(
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    elementIdSet: Set<string>
  ): Map<string, number> {
    const relationshipCountMap = new Map<string, number>();

    for (const relationship of relationships) {
      if (!this.isVisibleRelationship(relationship, elementIdSet)) {
        continue;
      }

      relationshipCountMap.set(
        relationship.sourceElementId,
        (relationshipCountMap.get(relationship.sourceElementId) ?? 0) + 1
      );
      relationshipCountMap.set(
        relationship.targetElementId,
        (relationshipCountMap.get(relationship.targetElementId) ?? 0) + 1
      );
    }

    return relationshipCountMap;
  }

  private buildNodes(
    elements: Element[],
    relationshipCountMap: Map<string, number>
  ): ChartNode[] {
    return elements.map(element => ({
      id: element.id,
      name: element.name,
      type: element.type,
      schemaId: element.schemaId,
      icon: element.metadata?.['icon'],
      relationshipCount: relationshipCountMap.get(element.id) ?? 0,
      category: this.getCategoryLabel(element),
    }));
  }

  private buildEdges(
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    elementIdSet: Set<string>,
    typeMap: Map<string, RelationshipTypeDefinition>
  ): ChartEdge[] {
    return relationships
      .filter(relationship =>
        this.isVisibleRelationship(relationship, elementIdSet)
      )
      .map(relationship => {
        const type = typeMap.get(relationship.relationshipTypeId);
        return {
          source: relationship.sourceElementId,
          target: relationship.targetElementId,
          relationshipTypeId: relationship.relationshipTypeId,
          label: type?.name ?? relationship.relationshipTypeId,
          color: type?.color,
          note: relationship.note,
          relationshipId: relationship.id,
        };
      });
  }

  private isVisibleRelationship(
    relationship: ReturnType<
      RelationshipService['getAllRelationships']
    >[number],
    elementIdSet: Set<string>
  ): boolean {
    return (
      elementIdSet.has(relationship.sourceElementId) &&
      elementIdSet.has(relationship.targetElementId)
    );
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
    const seen = new Set<string>([focusId]);
    const queue: Array<{ id: string; depth: number }> = [
      { id: focusId, depth: 0 },
    ];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      if (depth < maxDepth) {
        this.enqueueNeighbors(id, depth, relationships, visited, seen, queue);
      }
    }

    return elements.filter(e => visited.has(e.id));
  }

  /** Enqueue unvisited neighbors of a node in both relationship directions. */
  private enqueueNeighbors(
    id: string,
    depth: number,
    relationships: ReturnType<RelationshipService['getAllRelationships']>,
    visited: Set<string>,
    seen: Set<string>,
    queue: Array<{ id: string; depth: number }>
  ): void {
    for (const rel of relationships) {
      if (
        rel.sourceElementId === id &&
        !visited.has(rel.targetElementId) &&
        !seen.has(rel.targetElementId)
      ) {
        seen.add(rel.targetElementId);
        queue.push({ id: rel.targetElementId, depth: depth + 1 });
      }
      if (
        rel.targetElementId === id &&
        !visited.has(rel.sourceElementId) &&
        !seen.has(rel.sourceElementId)
      ) {
        seen.add(rel.sourceElementId);
        queue.push({ id: rel.sourceElementId, depth: depth + 1 });
      }
    }
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
        .replaceAll('-', ' ') // Replace dashes with spaces
        .replaceAll(/\b\w/g, c => c.toUpperCase()); // Title case
      return name;
    }
    if (element.type === ElementType.Item) return 'Document';
    return String(element.type);
  }
}
