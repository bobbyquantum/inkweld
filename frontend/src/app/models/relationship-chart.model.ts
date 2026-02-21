/**
 * Relationship Chart Configuration Models
 *
 * Defines the data structures for the relationship chart element type,
 * which visualizes element relationships as an interactive graph.
 *
 * Chart configs are stored in the project's Yjs document alongside
 * elements, relationships, and other project-level data.
 */

import { ElementType } from '../../api-client';

// ─────────────────────────────────────────────────────────────────────────────
// Chart Layout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Available layout algorithms for the relationship chart.
 *
 * - 'force': Force-directed layout using fCoSE (fast compound spring embedder).
 * - 'hierarchical': Top-down DAG layout using dagre — great for family trees.
 * - 'circular': Nodes placed on a circle — good for showing the full network.
 * - 'grid': Nodes placed on a grid — compact, orderly.
 * - 'concentric': Nodes placed on concentric circles by degree — hubs at center.
 */
export type ChartLayout =
  | 'force'
  | 'hierarchical'
  | 'circular'
  | 'grid'
  | 'concentric';

// ─────────────────────────────────────────────────────────────────────────────
// Chart Filters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chart population mode.
 * - 'all': Show all elements (subject to type/schema filters).
 * - 'curated': Only show explicitly selected elements.
 */
export type ChartMode = 'all' | 'curated';

/**
 * Filter configuration for a relationship chart.
 * Controls which elements and relationships are included in the graph.
 */
export interface ChartFilters {
  /**
   * Population mode.
   * - 'all': include every element that passes type/schema filters.
   * - 'curated': include only elements in `includedElementIds`.
   * @default 'curated'
   */
  mode: ChartMode;

  /**
   * Explicit element IDs to include when mode is 'curated'.
   * Ignored in 'all' mode.
   */
  includedElementIds: string[];

  /**
   * Relationship type IDs to include.
   * Empty array = include all relationship types.
   */
  relationshipTypeIds: string[];

  /**
   * Worldbuilding schema IDs to include (e.g., 'character-v1', 'location-v1').
   * Empty array = include all schemas.
   */
  schemaIds: string[];

  /**
   * Element types to include in the chart.
   * Empty array = include all element types.
   */
  elementTypes: ElementType[];

  /**
   * Whether to include elements that have no relationships (orphans).
   * In 'curated' mode this is always true (you picked them explicitly).
   * In 'all' mode defaults to false.
   * @default false
   */
  showOrphans: boolean;

  /**
   * Optional element to center the graph on.
   * When set, only elements within `maxDepth` hops are shown.
   */
  focusElementId?: string;

  /**
   * Maximum traversal depth from the focus element.
   * Only used when `focusElementId` is set.
   * @default 3
   */
  maxDepth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chart Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single relationship chart element.
 * Each RELATIONSHIP_CHART element has exactly one ChartConfig.
 */
export interface ChartConfig {
  /** Links this config to its RELATIONSHIP_CHART element */
  elementId: string;

  /** Layout algorithm to use */
  layout: ChartLayout;

  /** Filter settings */
  filters: ChartFilters;

  /**
   * User-pinned node positions (element ID → coordinates).
   * Nodes dragged by the user are saved here so positions persist.
   */
  nodePositions?: Record<string, { x: number; y: number }>;

  /**
   * Saved viewport state (pan + zoom).
   */
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Graph Data Structures (computed from project data + filters)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A node in the relationship chart graph
 */
export interface ChartNode {
  /** Element ID */
  id: string;
  /** Element display name */
  name: string;
  /** Element type (ITEM, WORLDBUILDING, FOLDER, etc.) */
  type: ElementType;
  /** Worldbuilding schema ID (e.g., 'character-v1') */
  schemaId?: string;
  /** Material icon name for this element */
  icon?: string;
  /** Number of relationships this element has */
  relationshipCount: number;
  /** Category label for legend grouping (derived from schema or element type) */
  category: string;
  /** Raw image URL from identity data (data: URL, media:// URL, or HTTP URL) */
  rawImageUrl?: string;
}

/**
 * An edge in the relationship chart graph
 */
export interface ChartEdge {
  /** Source element ID */
  source: string;
  /** Target element ID */
  target: string;
  /** Relationship type ID */
  relationshipTypeId: string;
  /** Relationship type display name */
  label: string;
  /** Relationship type color */
  color?: string;
  /** Optional note on the relationship */
  note?: string;
  /** Unique relationship instance ID */
  relationshipId: string;
}

/**
 * Complete graph data for rendering
 */
export interface ChartGraphData {
  nodes: ChartNode[];
  edges: ChartEdge[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a default ChartConfig for a new relationship chart element
 */
export function createDefaultChartConfig(elementId: string): ChartConfig {
  return {
    elementId,
    layout: 'force',
    filters: {
      mode: 'curated',
      includedElementIds: [],
      relationshipTypeIds: [],
      schemaIds: [],
      elementTypes: [],
      showOrphans: true,
    },
  };
}
