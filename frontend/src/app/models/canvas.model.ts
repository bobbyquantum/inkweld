/**
 * Canvas Element Configuration Models
 *
 * Defines the data structures for the Canvas element type — a general-purpose
 * infinite canvas with a layer system. Supports images, text, freehand drawing,
 * geometric shapes, and pin markers linked to project elements.
 *
 * Use cases: world maps, floor plans, mood boards, storyboards, reference layouts.
 *
 * Canvas configs are stored in the project's Yjs document alongside
 * elements, relationships, and other project-level data.
 */

import { nanoid } from 'nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Layers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named layer that groups canvas objects.
 * Layers control z-order, visibility, and lock state.
 */
export interface CanvasLayer {
  /** Unique layer ID */
  id: string;
  /** User-assigned layer name (e.g. "Floor 1", "Political Borders") */
  name: string;
  /** Whether objects on this layer are rendered */
  visible: boolean;
  /** Whether objects on this layer can be selected/moved/edited */
  locked: boolean;
  /** Layer opacity (0–1) */
  opacity: number;
  /** Z-order index. Higher = rendered on top. */
  order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Objects
// ─────────────────────────────────────────────────────────────────────────────

/** Discriminator for CanvasObject subtypes */
export type CanvasObjectType = 'image' | 'text' | 'path' | 'shape' | 'pin';

/** Base properties shared by all canvas objects */
interface CanvasObjectBase {
  /** Unique object ID */
  id: string;
  /** Layer this object belongs to */
  layerId: string;
  /** Object type discriminator */
  type: CanvasObjectType;
  /** X position in canvas coordinates */
  x: number;
  /** Y position in canvas coordinates */
  y: number;
  /** Rotation in degrees */
  rotation: number;
  /** Horizontal scale factor */
  scaleX: number;
  /** Vertical scale factor */
  scaleY: number;
  /** Whether this object is rendered */
  visible: boolean;
  /** Whether this object can be selected/moved/edited */
  locked: boolean;
  /** Optional display name shown in the objects sidebar */
  name?: string;
}

// ─── Image Object ────────────────────────────────────────────────────────────

/** Raster or SVG image placed on the canvas */
export interface CanvasImage extends CanvasObjectBase {
  type: 'image';
  /**
   * Image source URL.
   * - `media://` URL for project media assets
   * - `data:` URL for inline images
   * - HTTP(S) URL for external images
   */
  src: string;
  /** Natural width of the image in canvas units */
  width: number;
  /** Natural height of the image in canvas units */
  height: number;
}

// ─── Text Object ─────────────────────────────────────────────────────────────

/** Text block placed on the canvas */
export interface CanvasText extends CanvasObjectBase {
  type: 'text';
  /** Text content */
  text: string;
  /** Font size in pixels (canvas units) */
  fontSize: number;
  /** Font family name */
  fontFamily: string;
  /** Font style */
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic';
  /** Text color (CSS color string) */
  fill: string;
  /** Text box width for wrapping. 0 = no wrapping. */
  width: number;
  /** Text alignment */
  align: 'left' | 'center' | 'right';
}

// ─── Path Object ─────────────────────────────────────────────────────────────

/** Freehand drawing or polyline */
export interface CanvasPath extends CanvasObjectBase {
  type: 'path';
  /** Flat array of coordinates: [x1, y1, x2, y2, ...] relative to object origin */
  points: number[];
  /** Stroke color (CSS color string) */
  stroke: string;
  /** Stroke width in pixels */
  strokeWidth: number;
  /** Whether path is closed (polygon) with optional fill */
  closed: boolean;
  /** Fill color (only used when closed=true) */
  fill?: string;
  /** Spline tension. 0 = straight segments, > 0 = smooth curves. */
  tension: number;
}

// ─── Shape Object ────────────────────────────────────────────────────────────

/** Geometric shape types */
export type CanvasShapeType = 'rect' | 'ellipse' | 'polygon' | 'line' | 'arrow';

/** Geometric shape placed on the canvas */
export interface CanvasShape extends CanvasObjectBase {
  type: 'shape';
  /** Specific shape variant */
  shapeType: CanvasShapeType;
  /** Width of the shape bounding box */
  width: number;
  /** Height of the shape bounding box */
  height: number;
  /** Points array (for polygon/line/arrow shapes) */
  points?: number[];
  /** Fill color (CSS color string) */
  fill?: string;
  /** Stroke color (CSS color string) */
  stroke: string;
  /** Stroke width in pixels */
  strokeWidth: number;
  /** Corner radius for rect shapes */
  cornerRadius?: number;
  /** Dash pattern for dashed lines: [dash, gap] */
  dash?: number[];
}

// ─── Pin Object ──────────────────────────────────────────────────────────────

/**
 * Well-known relationship type ID for canvas-pin → element links.
 * This type is auto-created in the project's relationship types if not present.
 */
export const CANVAS_PIN_RELATIONSHIP_TYPE = 'canvas-pin';

/** Pin marker linked to a project element */
export interface CanvasPin extends CanvasObjectBase {
  type: 'pin';
  /** Pin display label */
  label: string;
  /** Material icon name */
  icon: string;
  /** Pin marker color (CSS color string) */
  color: string;
  /** Linked project element ID (creates a relationship) */
  linkedElementId?: string;
  /** ID of the ElementRelationship backing this link (for cleanup) */
  relationshipId?: string;
  /** Optional note / description */
  note?: string;
}

// ─── Union Type ──────────────────────────────────────────────────────────────

/** Any object that can be placed on the canvas */
export type CanvasObject =
  | CanvasImage
  | CanvasText
  | CanvasPath
  | CanvasShape
  | CanvasPin;

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Configuration (persisted to Yjs metadata)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single canvas element.
 * Stored in element metadata and synced to all collaborators via Yjs.
 */
export interface CanvasConfig {
  /** Links this config to its CANVAS element */
  elementId: string;
  /** Ordered list of layers */
  layers: CanvasLayer[];
  /** All objects on all layers */
  objects: CanvasObject[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Viewport (local-only, per-user, stored in localStorage)
// ─────────────────────────────────────────────────────────────────────────────

/** Saved viewport state (pan + zoom). Per-user, NOT synced. */
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Tool (runtime only, not persisted)
// ─────────────────────────────────────────────────────────────────────────────

/** Available canvas tools */
export type CanvasTool =
  | 'select'
  | 'rectSelect'
  | 'pan'
  | 'pin'
  | 'draw'
  | 'line'
  | 'shape'
  | 'text'
  | 'image';

/** Persistent drawing/tool settings */
export interface CanvasToolSettings {
  /** Stroke color for new shapes/paths */
  stroke: string;
  /** Stroke width for new shapes/paths */
  strokeWidth: number;
  /** Fill color for new shapes/text */
  fill: string;
  /** Font size for new text objects */
  fontSize: number;
  /** Font family for new text objects */
  fontFamily: string;
  /** Default shape variant */
  shapeType: CanvasShapeType;
  /** Spline tension for the draw tool */
  tension: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults & Factories
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a default CanvasConfig for a new canvas element */
export function createDefaultCanvasConfig(elementId: string): CanvasConfig {
  return {
    elementId,
    layers: [createDefaultLayer('Layer 1', 0)],
    objects: [],
  };
}

/** Creates a new layer with sensible defaults */
export function createDefaultLayer(name: string, order: number): CanvasLayer {
  return {
    id: nanoid(),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    order,
  };
}

/** Creates default tool settings */
export function createDefaultToolSettings(): CanvasToolSettings {
  return {
    stroke: '#333333',
    strokeWidth: 2,
    fill: '#ffffff',
    fontSize: 18,
    fontFamily: 'Arial',
    shapeType: 'rect',
    tension: 0,
  };
}
