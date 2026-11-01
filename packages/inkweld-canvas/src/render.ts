/**
 * What `render_canvas` does before it draws anything: which area to show, how
 * big, and what an agent should know about the layout. Shared by the server
 * tool and the browser tool, which differ only in how they make the image.
 */

import { fail, isRecord, CanvasInputError } from './agent-fields';
import type { CanvasContents } from './edit';
import { canvasSizeFrame, isBackgroundImage } from './model';
import { canvasObjectBounds, computeSvgViewBox, type CanvasRect } from './svg';
import { estimateTextSize, type TextMeasurer } from './text-layout';

export const DEFAULT_RENDER_SIZE = 1024;
export const MIN_RENDER_SIZE = 64;
export const MAX_RENDER_SIZE = 2048;

/** The most warnings a render reports; the rest are summed up. */
const MAX_LAYOUT_WARNINGS = 12;

export interface CanvasRenderPlan {
  /** The area to show, in canvas units. */
  region: CanvasRect;
  /** What the area is, in words: a frame's name or "all content". */
  regionName: string;
  /** Whether the area is a frame, which objects are meant to stay inside. */
  isFrame: boolean;
  /** The image's size in pixels. */
  width: number;
  height: number;
  /** Image pixels per canvas unit. */
  scale: number;
}

function readMaxSize(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_RENDER_SIZE;
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < MIN_RENDER_SIZE ||
    raw > MAX_RENDER_SIZE
  ) {
    fail(
      `maxSize must be a whole number from ${MIN_RENDER_SIZE} to ${MAX_RENDER_SIZE}`,
    );
  }
  return raw;
}

function readRegion(raw: unknown): CanvasRect {
  if (!isRecord(raw)) fail('region must be an object');
  const { x, y, width, height } = raw;
  for (const value of [x, y, width, height]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail('region needs numeric x, y, width and height');
    }
  }
  if ((width as number) <= 0 || (height as number) <= 0) {
    fail('region must have a width and height above 0');
  }
  return raw as unknown as CanvasRect;
}

/** The area an agent asked for, or the one that best shows the canvas. */
function chooseRegion(
  contents: CanvasContents,
  args: Record<string, unknown>,
  measure: TextMeasurer,
): Pick<CanvasRenderPlan, 'region' | 'regionName' | 'isFrame'> {
  const frameId = args['frameId'];
  if (frameId !== undefined && frameId !== null) {
    if (typeof frameId !== 'string') fail('frameId must be a string');
    const frame = contents.frames?.find((f) => f.id === frameId);
    if (!frame) {
      const known = (contents.frames ?? [])
        .map((f) => `${f.id} (${f.name})`)
        .join(', ');
      fail(`frameId: no such frame "${frameId}". Frames: ${known || 'none'}`);
    }
    return { region: frame, regionName: frame.name, isFrame: true };
  }

  if (args['region'] !== undefined && args['region'] !== null) {
    return {
      region: readRegion(args['region']),
      regionName: 'the requested region',
      isFrame: false,
    };
  }

  const page = canvasSizeFrame(contents.frames);
  if (page) return { region: page, regionName: page.name, isFrame: true };

  if (!contents.objects.some((o) => o.visible)) {
    fail(
      'This canvas has nothing to show yet: it has no visible objects and no frame of kind "canvas".',
    );
  }
  const layers = contents.layers.filter((l) => l.visible);
  const { vX, vY, vW, vH } = computeSvgViewBox(contents, layers, {
    measureText: measure,
  });
  return {
    region: { x: vX, y: vY, width: vW, height: vH },
    regionName: 'all content',
    isFrame: false,
  };
}

/**
 * Work out what to draw. Returns `{ error }` for arguments that cannot be
 * honoured. The image's longest side is `maxSize`, so a small region comes out
 * magnified, which is how an agent looks closely at something.
 */
export function planCanvasRender(
  contents: CanvasContents,
  args: Record<string, unknown>,
  measure: TextMeasurer = estimateTextSize,
): CanvasRenderPlan | { error: string } {
  try {
    const maxSize = readMaxSize(args['maxSize']);
    const chosen = chooseRegion(contents, args, measure);
    const { width, height } = chosen.region;
    const scale = maxSize / Math.max(width, height);
    return {
      ...chosen,
      scale,
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  } catch (error) {
    if (error instanceof CanvasInputError) return { error: error.message };
    throw error;
  }
}

function extendsPast(inner: CanvasRect, outer: CanvasRect): string[] {
  const edges: string[] = [];
  if (inner.x < outer.x) edges.push('left');
  if (inner.y < outer.y) edges.push('top');
  if (inner.x + inner.width > outer.x + outer.width) edges.push('right');
  if (inner.y + inner.height > outer.y + outer.height) edges.push('bottom');
  return edges;
}

function overlaps(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Problems a glance at the image can miss. Objects have fixed positions and
 * nothing flows, so text that grew or an object placed off the page goes
 * unreported otherwise. Only meaningful for a frame: that is what objects are
 * meant to stay inside. Rotated objects are skipped, as their bounds are only
 * approximate here.
 */
export function canvasLayoutWarnings(
  contents: CanvasContents,
  plan: CanvasRenderPlan,
  measure: TextMeasurer = estimateTextSize,
): string[] {
  if (!plan.isFrame) return [];
  const hiddenLayers = new Set(
    contents.layers.filter((l) => !l.visible).map((l) => l.id),
  );
  const warnings: string[] = [];
  for (const obj of contents.objects) {
    if (!obj.visible || isBackgroundImage(obj)) continue;
    if (obj.type !== 'pin' && hiddenLayers.has(obj.layerId)) continue;
    const bounds = canvasObjectBounds(obj, measure);
    if (!bounds) continue;
    const name = `${obj.type} "${obj.name ?? obj.id}"`;
    if (!overlaps(bounds, plan.region)) {
      warnings.push(`${name} is entirely outside ${plan.regionName}.`);
      continue;
    }
    const edges = extendsPast(bounds, plan.region);
    if (edges.length > 0) {
      warnings.push(
        `${name} runs past the ${edges.join(' and ')} of ${plan.regionName}.`,
      );
    }
  }
  if (warnings.length <= MAX_LAYOUT_WARNINGS) return warnings;
  const extra = warnings.length - MAX_LAYOUT_WARNINGS;
  return [
    ...warnings.slice(0, MAX_LAYOUT_WARNINGS),
    `And ${extra} more objects like these.`,
  ];
}

/** The result an agent gets with the image: the same fields from both tools. */
export function describeCanvasRender(
  elementId: string,
  elementName: string,
  plan: CanvasRenderPlan,
  warnings: string[],
): Record<string, unknown> {
  return {
    elementId,
    elementName,
    shows: plan.regionName,
    region: {
      x: plan.region.x,
      y: plan.region.y,
      width: plan.region.width,
      height: plan.region.height,
    },
    image: { width: plan.width, height: plan.height, scale: plan.scale },
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
