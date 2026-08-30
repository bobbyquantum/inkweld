/**
 * Granular canvas changes.
 *
 * A canvas used to be persisted as one JSON blob on the owning element, which
 * meant every stroke rewrote the whole canvas — and, because element metadata
 * lives in the project's element array, the whole project with it. Two people
 * drawing at once simply overwrote each other.
 *
 * These helpers describe a change as the objects that actually moved, so a
 * sync provider can write per-object entries that merge instead of a blob that
 * clobbers. They are pure: no Yjs, no Angular, no I/O.
 */

import type { CanvasConfig, CanvasLayer, CanvasObject } from './canvas.model';

/** The synced contents of a canvas — everything except which element owns it. */
export type CanvasContents = Omit<CanvasConfig, 'elementId'>;

/** A minimal description of what changed on a canvas. */
export interface CanvasEdit {
  /** Full layer list, present only when a layer changed. */
  layers?: CanvasLayer[];
  /** Objects that were added or modified. */
  upserts?: CanvasObject[];
  /** Ids of objects that were removed. */
  deletes?: string[];
  /**
   * Full object id list in z-order, present only when objects were reordered.
   * Plain adds and removes don't need it: the provider appends new ids and
   * drops deleted ones, which is what lets two peers add strokes at the same
   * time without fighting over a shared ordering.
   */
  order?: string[];
}

/**
 * Element metadata key holding a canvas snapshot.
 *
 * This is no longer the live editing surface, but it remains the interchange
 * format: archives, project templates and the media-usage scan all read it.
 */
export const CANVAS_CONFIG_META_KEY = 'canvasConfig';

/** Empty canvas contents — a canvas nobody has drawn on yet. */
export function emptyCanvasContents(): CanvasContents {
  return { layers: [], objects: [] };
}

/**
 * Parse a canvas snapshot from element metadata. Returns `null` when the value
 * is missing or unusable, so callers can fall back to defaults.
 */
export function parseCanvasContents(
  serialized: string | null | undefined
): CanvasContents | null {
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as Partial<CanvasContents>;
    return {
      layers: Array.isArray(parsed.layers) ? parsed.layers : [],
      objects: Array.isArray(parsed.objects) ? parsed.objects : [],
    };
  } catch {
    return null;
  }
}

/** True when the edit carries no actual change. */
export function isEmptyCanvasEdit(edit: CanvasEdit): boolean {
  return (
    edit.layers === undefined &&
    edit.order === undefined &&
    !edit.upserts?.length &&
    !edit.deletes?.length
  );
}

/**
 * Work out what changed between two canvas states.
 *
 * Comparison is by reference: every canvas mutation rebuilds the arrays it
 * touches and reuses the objects it doesn't, so an unchanged object is
 * literally the same object. That makes the diff O(n) in cheap comparisons
 * rather than a deep structural walk.
 */
export function diffCanvasContents(
  previous: CanvasContents | null,
  next: CanvasContents
): CanvasEdit {
  const edit: CanvasEdit = {};

  if (!previous || previous.layers !== next.layers) {
    edit.layers = next.layers;
  }

  const previousObjects = previous?.objects ?? [];
  const previousById = new Map(previousObjects.map(o => [o.id, o]));

  const upserts: CanvasObject[] = [];
  for (const object of next.objects) {
    if (previousById.get(object.id) !== object) upserts.push(object);
  }
  if (upserts.length > 0) edit.upserts = upserts;

  const nextIds = new Set(next.objects.map(o => o.id));
  const deletes = previousObjects
    .filter(o => !nextIds.has(o.id))
    .map(o => o.id);
  if (deletes.length > 0) edit.deletes = deletes;

  if (orderChanged(previousObjects, next.objects, deletes.length > 0)) {
    edit.order = next.objects.map(o => o.id);
  }

  return edit;
}

/**
 * Whether the z-order changed beyond appends and removals, which providers
 * handle without being told the whole sequence.
 */
function orderChanged(
  previous: CanvasObject[],
  next: CanvasObject[],
  hasDeletes: boolean
): boolean {
  const previousIds = hasDeletes
    ? previous.filter(o => next.some(n => n.id === o.id)).map(o => o.id)
    : previous.map(o => o.id);

  // Anything the provider will append must sit at the end to be an append.
  if (next.length < previousIds.length) return true;
  for (const [index, id] of previousIds.entries()) {
    if (next[index]?.id !== id) return true;
  }
  return false;
}

/**
 * Apply an edit to canvas contents, returning new contents.
 *
 * Used by providers that persist a canvas as a single document, where there is
 * no concurrency to merge and the edit is just a compact way to describe the
 * change.
 */
export function applyCanvasEdit(
  contents: CanvasContents,
  edit: CanvasEdit
): CanvasContents {
  const layers = edit.layers ?? contents.layers;

  const byId = new Map(contents.objects.map(o => [o.id, o]));
  const order = contents.objects.map(o => o.id);

  for (const id of edit.deletes ?? []) byId.delete(id);

  for (const object of edit.upserts ?? []) {
    if (!byId.has(object.id)) order.push(object.id);
    byId.set(object.id, object);
  }

  const sequence = edit.order ?? order;
  const seen = new Set<string>();
  const objects: CanvasObject[] = [];

  for (const id of sequence) {
    const object = byId.get(id);
    if (!object || seen.has(id)) continue;
    seen.add(id);
    objects.push(object);
  }
  // Anything the ordering forgot still belongs on the canvas.
  for (const [id, object] of byId) {
    if (!seen.has(id)) objects.push(object);
  }

  return { layers, objects };
}
