/**
 * What an agent sees of a canvas. A canvas with hand-drawn strokes can run to
 * megabytes of points, so the default view leaves out what an agent rarely
 * needs and pages through the objects; it can ask for specific objects whole.
 */

import { CanvasInputError, fail, isRecord } from './agent-fields';
import type { CanvasContents } from './edit';
import { type CanvasObject, LIGHT_PAGE } from './model';

export const DEFAULT_OBJECT_LIMIT = 200;
export const MAX_OBJECT_LIMIT = 1000;
export const MAX_OBJECT_IDS = 100;

/** Text beyond this is cut in the summary view; `objectIds` returns it whole. */
const SUMMARY_TEXT_LENGTH = 500;

/** Inline image sources are cut to this in the summary view. */
const SUMMARY_SRC_LENGTH = 48;

function withoutManagedFields(object: CanvasObject): Record<string, unknown> {
  const view: Record<string, unknown> = { ...object };
  delete view['relationshipId'];
  return view;
}

/** Rotating leaves floating-point noise that an agent has no use for. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The area a list of relative points covers, in canvas coordinates. As in the
 * app, an object scales first and then rotates around its own x and y.
 */
function pointBounds(view: Record<string, unknown>, points: number[]) {
  const scaleX = view['scaleX'] as number;
  const scaleY = view['scaleY'] as number;
  const angle =
    (((view['rotation'] as number | undefined) ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i] * scaleX;
    const y = points[i + 1] * scaleY;
    xs.push(x * cos - y * sin);
    ys.push(x * sin + y * cos);
  }
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: tidy((view['x'] as number) + left),
    y: tidy((view['y'] as number) + top),
    width: tidy(Math.max(...xs) - left),
    height: tidy(Math.max(...ys) - top),
  };
}

function summarizeObject(object: CanvasObject): Record<string, unknown> {
  const view = withoutManagedFields(object);

  if (Array.isArray(view['points']) && view['points'].length > 0) {
    view['pointCount'] = view['points'].length / 2;
    view['bounds'] = pointBounds(view, view['points'] as number[]);
    delete view['points'];
    delete view['pressures'];
  }

  if (typeof view['src'] === 'string' && view['src'].startsWith('data:')) {
    view['srcLength'] = view['src'].length;
    view['src'] = `${view['src'].slice(0, SUMMARY_SRC_LENGTH)}…`;
  }

  if (
    typeof view['text'] === 'string' &&
    view['text'].length > SUMMARY_TEXT_LENGTH
  ) {
    view['textLength'] = view['text'].length;
    view['text'] = `${view['text'].slice(0, SUMMARY_TEXT_LENGTH)}…`;
  }

  return view;
}

function readLimit(raw: unknown): number {
  if (raw === undefined || raw === null) return DEFAULT_OBJECT_LIMIT;
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > MAX_OBJECT_LIMIT
  ) {
    fail(`limit must be a whole number from 1 to ${MAX_OBJECT_LIMIT}`);
  }
  return raw;
}

function readOffset(raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    fail('offset must be a whole number, 0 or more');
  }
  return raw;
}

/** The objects `args` selects, with the fields that describe the selection. */
function selectObjects(
  contents: CanvasContents,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (args['objectIds'] !== undefined && args['objectIds'] !== null) {
    if (
      !Array.isArray(args['objectIds']) ||
      args['objectIds'].some((id) => typeof id !== 'string')
    ) {
      fail('objectIds must be an array of object ids');
    }
    if (args['objectIds'].length > MAX_OBJECT_IDS) {
      fail(`objectIds can name at most ${MAX_OBJECT_IDS} objects`);
    }
    const wanted = new Set(args['objectIds'] as string[]);
    const found = contents.objects.filter((o) => wanted.has(o.id));
    const foundIds = new Set(found.map((o) => o.id));
    const missing = [...wanted].filter((id) => !foundIds.has(id));
    return {
      objects: found.map(withoutManagedFields),
      ...(missing.length > 0 ? { missingObjectIds: missing } : {}),
    };
  }

  const limit = readLimit(args['limit']);
  const offset = readOffset(args['offset']);
  let matching = contents.objects;
  const layerId = args['layerId'];
  if (layerId !== undefined && layerId !== null) {
    if (typeof layerId !== 'string') fail('layerId must be a string');
    if (!contents.layers.some((l) => l.id === layerId)) {
      fail(`layerId: no such layer "${layerId}"`);
    }
    matching = matching.filter((o) => o.layerId === layerId);
  }
  const hasMore = offset + limit < matching.length;
  return {
    matchingObjects: matching.length,
    offset,
    limit,
    hasMore,
    objects: matching.slice(offset, offset + limit).map(summarizeObject),
  };
}

/**
 * The result of `get_canvas`: the same fields from both tools. Returns
 * `{ error }` for arguments that cannot be honoured.
 */
export function describeCanvas(
  elementId: string,
  elementName: string,
  contents: CanvasContents,
  args: unknown,
): Record<string, unknown> | { error: string } {
  try {
    if (!isRecord(args)) fail('arguments must be an object');
    return {
      elementId,
      elementName,
      background: contents.background ?? LIGHT_PAGE.background,
      inkColor: contents.inkColor ?? LIGHT_PAGE.inkColor,
      layers: [...contents.layers].sort((a, b) => a.order - b.order),
      frames: contents.frames ?? [],
      objectCount: contents.objects.length,
      ...selectObjects(contents, args),
    };
  } catch (error) {
    if (error instanceof CanvasInputError) return { error: error.message };
    throw error;
  }
}
