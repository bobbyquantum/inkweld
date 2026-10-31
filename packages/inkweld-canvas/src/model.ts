/**
 * Canvas data model.
 *
 * A canvas is a general-purpose infinite surface with a layer system holding
 * images, text, freehand drawing, geometric shapes and pin markers linked to
 * project elements. Use cases: world maps, floor plans, mood boards,
 * storyboards, reference layouts.
 *
 * These are the shapes stored in the project's Yjs document, so the backend
 * and the frontend read and write the same thing. UI-only state (tools,
 * viewport) stays in the frontend's `canvas.model.ts`.
 */

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

/** A drop shadow. Blur and offsets are in canvas units. */
export interface CanvasShadow {
  /** CSS color */
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  /** 0–1. Undefined means fully opaque. */
  opacity?: number;
}

/** How an object mixes with what is below it on its layer. */
export const CANVAS_BLEND_MODES = [
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
] as const;

export type CanvasBlendMode = (typeof CANVAS_BLEND_MODES)[number];

/**
 * Fonts that ship with Inkweld: every browser gets them from the app, and the
 * server has the same files, so text in these looks the same everywhere. Any
 * other family depends on what is installed on the machine showing the canvas.
 */
export const CANVAS_BUNDLED_FONTS = [
  'EB Garamond',
  'Source Serif 4',
  'Source Sans 3',
  'Lato',
  'Source Code Pro',
  'Courier Prime',
] as const;

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
  /** Drop shadow. Not drawn on pins, which have their own. */
  shadow?: CanvasShadow;
  /** Undefined means normal. Not applied to pins. */
  blendMode?: CanvasBlendMode;
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
  /**
   * How the picture fills the width × height box. `fill` (the default)
   * stretches it, `cover` crops it to fill the box, `contain` fits it inside.
   */
  fit?: CanvasImageFit;
  /** Rounds the corners of the box. */
  cornerRadius?: number;
}

export type CanvasImageFit = 'fill' | 'cover' | 'contain';

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
  /** Line spacing as a multiple of the font size. Undefined means 1. */
  lineHeight?: number;
  /** Extra space between characters, in canvas units. */
  letterSpacing?: number;
  /** Outline color (CSS color string), drawn behind the fill. */
  stroke?: string;
  /** Outline width. */
  strokeWidth?: number;
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

/** Whether an object's fill can be a CSS gradient (closed area shapes only). */
export function supportsGradientFill(obj: CanvasObject): boolean {
  return (
    obj.type === 'shape' &&
    (obj.shapeType === 'rect' ||
      obj.shapeType === 'ellipse' ||
      obj.shapeType === 'polygon')
  );
}

/** True when `obj` is a non-interactive background image. */
export function isBackgroundImage(obj: CanvasObject): obj is CanvasImage {
  return obj.type === 'image' && obj.isBackground === true;
}

/** Objects that can carry an element link (pin markers and region shapes). */
export function isLinkableObject(
  obj: CanvasObject,
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
  frames: CanvasFrame[] | undefined,
): CanvasFrame | undefined {
  return frames?.find((f) => f.kind === 'canvas');
}

// ─────────────────────────────────────────────────────────────────────────────
// Page settings (background + default ink)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Colours that belong to the canvas document rather than to the UI theme.
 *
 * Every colour a user puts on a canvas is absolute, so the surface under it
 * has to be absolute too — a drawing made with dark ink on a white page must
 * not turn into dark ink on a near-black page because a collaborator prefers
 * dark mode. The page background is therefore stored with the canvas, synced
 * to everyone, and painted beneath exports; only the pasteboard around the
 * page follows the app theme.
 */
export interface CanvasPageSettings {
  /**
   * Page background colour (CSS colour string). Painted inside the canvas-size
   * frame when there is one, otherwise across the whole infinite canvas.
   */
  background: string;
  /**
   * Default ink colour for this canvas: the stroke colour the pen starts with
   * when the canvas is opened. Chosen against the page, not the theme.
   */
  inkColor: string;
}

/** Page colours for a light page. */
export const LIGHT_PAGE: CanvasPageSettings = {
  background: '#FFFFFF',
  inkColor: '#333333',
};

/** Page colours for a dark page. */
export const DARK_PAGE: CanvasPageSettings = {
  background: '#1E1E1E',
  inkColor: '#F2F2F2',
};

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Configuration (persisted to Yjs metadata)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single canvas element.
 * Stored in element metadata and synced to all collaborators via Yjs.
 */
export interface CanvasConfig extends CanvasPageSettings {
  /** Links this config to its CANVAS element */
  elementId: string;
  /** Ordered list of layers */
  layers: CanvasLayer[];
  /** All objects on all layers */
  objects: CanvasObject[];
  /** Canvas size + crop frames; absent until the first frame is added */
  frames?: CanvasFrame[];
}
