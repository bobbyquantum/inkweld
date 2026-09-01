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
  /** Object opacity (0–1). Undefined means fully opaque. */
  opacity?: number;
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
  /**
   * Non-interactive backdrop (map base image). Background images ignore the
   * pointer, cannot be selected or erased, and always render below the other
   * objects on their layer. Several backgrounds can tile one large map.
   */
  isBackground?: boolean;
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
  /**
   * Per-point width multipliers (0–1), one per point in {@link points}.
   * Present only for pressure/velocity-modulated ink; when set the stroke is
   * rendered as a filled outline whose half-width is
   * `strokeWidth / 2 * pressures[i]` instead of a uniform stroked polyline.
   */
  pressures?: number[];
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
  /**
   * Linked project element ID — a shape linked to an element is a "region":
   * a mapped area you can click to open the element. Several shapes sharing
   * a link form one discontinuous region.
   */
  linkedElementId?: string;
  /** ID of the ElementRelationship backing this link (for cleanup) */
  relationshipId?: string;
}

// ─── Pin Object ──────────────────────────────────────────────────────────────

/**
 * Well-known relationship type ID for canvas-pin → element links.
 * This type is auto-created in the project's relationship types if not present.
 */
export const CANVAS_PIN_RELATIONSHIP_TYPE = 'canvas-pin';

/**
 * Well-known relationship type ID for shape ("region") → element links.
 * Auto-created in the project's relationship types if not present.
 */
export const CANVAS_AREA_RELATIONSHIP_TYPE = 'canvas-area';

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
  CanvasImage | CanvasText | CanvasPath | CanvasShape | CanvasPin;

/** True when `obj` is a non-interactive background image. */
/** Whether an object's fill can be a CSS gradient (closed area shapes only). */
export function supportsGradientFill(obj: CanvasObject): boolean {
  return (
    obj.type === 'shape' &&
    (obj.shapeType === 'rect' ||
      obj.shapeType === 'ellipse' ||
      obj.shapeType === 'polygon')
  );
}

export function isBackgroundImage(obj: CanvasObject): obj is CanvasImage {
  return obj.type === 'image' && obj.isBackground === true;
}

/** Objects that can carry an element link (pin markers and region shapes). */
export function isLinkableObject(
  obj: CanvasObject
): obj is CanvasPin | CanvasShape {
  return obj.type === 'pin' || obj.type === 'shape';
}

// ─────────────────────────────────────────────────────────────────────────────
// Frames (canvas size + crop regions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Frame kinds:
 * - `canvas`: THE canvas size — the page. Default export bounds and the main
 *   border. At most one per canvas (enforced functionally, see
 *   {@link canvasSizeFrame}).
 * - `crop`: a named crop region for alternate exports (cover crop, region
 *   cut-outs of a map, …).
 */
export type CanvasFrameKind = 'canvas' | 'crop';

/**
 * A rectangular bound on the canvas. Frames are not canvas objects: they
 * never take part in object selection, clipboard or drawing — they only
 * render as borders and define export crops.
 */
export interface CanvasFrame {
  /** Unique frame ID */
  id: string;
  /** Display name ("Canvas", "Cover", "Region: North") */
  name: string;
  /** See {@link CanvasFrameKind} */
  kind: CanvasFrameKind;
  /** Top-left corner in canvas world coordinates. Axis-aligned; no rotation. */
  x: number;
  y: number;
  /** Size in canvas units */
  width: number;
  height: number;
  /** Whether the border is shown on the canvas */
  visible: boolean;
}

/** The canvas-size frame, when one exists. First wins under a brief race. */
export function canvasSizeFrame(
  frames: CanvasFrame[] | undefined
): CanvasFrame | undefined {
  return frames?.find(f => f.kind === 'canvas');
}

/** Create a frame with a fresh id. */
export function createFrame(
  kind: CanvasFrameKind,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): CanvasFrame {
  return { id: nanoid(), name, kind, x, y, width, height, visible: true };
}

/** Size presets offered when adding a frame. */
export const FRAME_PRESETS = [
  // 1:1.6 portrait — matches the project cover pipeline (1600×2560 fit)
  { key: 'cover', width: 1000, height: 1600 },
  { key: 'hd', width: 1920, height: 1080 },
  { key: 'square', width: 2048, height: 2048 },
  // A4 @ 150dpi
  { key: 'a4', width: 1240, height: 1754 },
] as const;

export type FramePresetKey = (typeof FRAME_PRESETS)[number]['key'];

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
  /**
   * Canvas size + crop frames. Optional for back-compat: canvases created
   * before frames existed simply have none.
   */
  frames?: CanvasFrame[];
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
  | 'eraser'
  | 'line'
  | 'shape'
  | 'polygon'
  | 'text'
  | 'image';

/** Tools that create new objects by dragging on the stage */
const DRAWING_TOOLS = new Set<CanvasTool>(['draw', 'line', 'shape']);

/** Tools that must receive raw stage input rather than hitting objects */
const STAGE_CAPTURE_TOOLS = new Set<CanvasTool>([
  'draw',
  'eraser',
  'line',
  'shape',
  'polygon',
  'rectSelect',
  'pin',
  'text',
]);

/** True when `tool` draws a new object by dragging (free-draw, line, shape). */
export function isDrawingTool(tool: CanvasTool): boolean {
  return DRAWING_TOOLS.has(tool);
}

/**
 * True when `tool` needs pointer events to reach the stage instead of the
 * objects on it — otherwise you cannot draw or drop a pin on top of an image,
 * and pressing an existing object drags it instead of starting a stroke.
 */
export function capturesStageInput(tool: CanvasTool): boolean {
  return STAGE_CAPTURE_TOOLS.has(tool);
}

/** Persistent drawing/tool settings */
export interface CanvasToolSettings {
  /** Stroke color for new shapes/paths */
  stroke: string;
  /** Stroke width for new shapes/paths */
  strokeWidth: number;
  /** Fill color for new shapes/text */
  fill: string;
  /** Whether new shapes are filled at all */
  fillEnabled: boolean;
  /** Opacity (0–1) applied to newly created objects */
  opacity: number;
  /** Font size for new text objects */
  fontSize: number;
  /** Font family for new text objects */
  fontFamily: string;
  /** Default shape variant */
  shapeType: CanvasShapeType;
  /** Spline tension for the draw tool */
  tension: number;
  /**
   * Whether freehand strokes vary in width with stylus pressure (or, for
   * mouse/trackpad input, with drawing speed).
   */
  pressure: boolean;
  /** Eraser radius in canvas units */
  eraserSize: number;
}

/** Stroke width presets offered in the toolbar */
export const STROKE_WIDTH_PRESETS = [1, 2, 4, 8, 16, 32] as const;

/** Bounds for the stroke width control */
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 96;

/** Bounds for the eraser radius control */
export const MIN_ERASER_SIZE = 4;
export const MAX_ERASER_SIZE = 200;

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
    strokeWidth: 3,
    fill: '#ffffff',
    fillEnabled: false,
    opacity: 1,
    fontSize: 18,
    fontFamily: 'Arial',
    shapeType: 'rect',
    tension: 0.35,
    pressure: true,
    eraserSize: 16,
  };
}

/**
 * Merge persisted (possibly partial or stale) tool settings over the current
 * defaults, dropping anything that isn't a usable value. Keeps older stored
 * settings working when new fields are added.
 */
export function normalizeToolSettings(stored: unknown): CanvasToolSettings {
  const defaults = createDefaultToolSettings();
  if (!stored || typeof stored !== 'object') return defaults;

  const s = stored as Partial<Record<keyof CanvasToolSettings, unknown>>;
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(Math.max(v, min), max)
      : fallback;
  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.length > 0 ? v : fallback;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === 'boolean' ? v : fallback;

  return {
    stroke: str(s.stroke, defaults.stroke),
    strokeWidth: num(
      s.strokeWidth,
      defaults.strokeWidth,
      MIN_STROKE_WIDTH,
      MAX_STROKE_WIDTH
    ),
    fill: str(s.fill, defaults.fill),
    fillEnabled: bool(s.fillEnabled, defaults.fillEnabled),
    opacity: num(s.opacity, defaults.opacity, 0.05, 1),
    fontSize: num(s.fontSize, defaults.fontSize, 6, 400),
    fontFamily: str(s.fontFamily, defaults.fontFamily),
    shapeType: (
      ['rect', 'ellipse', 'polygon', 'line', 'arrow'] as CanvasShapeType[]
    ).includes(s.shapeType as CanvasShapeType)
      ? (s.shapeType as CanvasShapeType)
      : defaults.shapeType,
    tension: num(s.tension, defaults.tension, 0, 1),
    pressure: bool(s.pressure, defaults.pressure),
    eraserSize: num(
      s.eraserSize,
      defaults.eraserSize,
      MIN_ERASER_SIZE,
      MAX_ERASER_SIZE
    ),
  };
}
