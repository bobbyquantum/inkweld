/**
 * Canvas Element Configuration Models
 *
 * The stored data model lives in `@inkweld/canvas`, shared with the backend's
 * MCP tools, and is re-exported here. This file adds the frontend's factories
 * and its UI-only state (tools, viewport).
 */

import {
  type CanvasConfig,
  type CanvasFrame,
  type CanvasFrameKind,
  type CanvasLayer,
  type CanvasPageSettings,
  type CanvasShapeType,
  DARK_PAGE,
  firstCanvasLayer,
  LIGHT_PAGE,
} from '@inkweld/canvas';
import { nanoid } from 'nanoid';

export {
  CANVAS_AREA_RELATIONSHIP_TYPE,
  CANVAS_PIN_RELATIONSHIP_TYPE,
  type CanvasConfig,
  type CanvasFrame,
  type CanvasFrameKind,
  type CanvasImage,
  type CanvasLayer,
  type CanvasObject,
  type CanvasObjectType,
  type CanvasPageSettings,
  type CanvasPath,
  type CanvasPin,
  type CanvasShape,
  type CanvasShapeType,
  canvasSizeFrame,
  type CanvasText,
  DARK_PAGE,
  firstCanvasLayer,
  isBackgroundImage,
  isLinkableObject,
  LIGHT_PAGE,
  supportsGradientFill,
} from '@inkweld/canvas';

// ─────────────────────────────────────────────────────────────────────────────
// Frames
// ─────────────────────────────────────────────────────────────────────────────

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
// Page settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Page colours to offer a user creating a canvas: a page that matches the
 * theme they are looking at, so a dark-mode user isn't handed a glaring white
 * sheet. The choice is then fixed in the document for everyone.
 */
export function defaultPageSettings(darkTheme: boolean): CanvasPageSettings {
  return darkTheme ? { ...DARK_PAGE } : { ...LIGHT_PAGE };
}

/**
 * Relative luminance (0 = black, 1 = white) of a `#rgb` / `#rrggbb` colour,
 * or null when the colour isn't a hex string. Used to pick a legible ink for
 * a page colour.
 */
export function hexLuminance(color: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map(c => c + c)
      .join('');
  }
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** True when `background` is dark enough that dark ink would vanish on it. */
export function isDarkBackground(background: string): boolean {
  const luminance = hexLuminance(background);
  return luminance !== null && luminance < 0.35;
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

/**
 * Creates a default CanvasConfig for a new canvas element. Page colours
 * default to a light page unless given.
 */
export function createDefaultCanvasConfig(
  elementId: string,
  page: CanvasPageSettings = LIGHT_PAGE
): CanvasConfig {
  return {
    elementId,
    layers: [firstCanvasLayer()],
    objects: [],
    background: page.background,
    inkColor: page.inkColor,
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
