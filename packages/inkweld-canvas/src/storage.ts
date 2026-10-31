/**
 * How canvases are stored in the project's elements document.
 *
 * Layout: `canvases` → elementId → { layers: json, objects: Map<id, json>,
 * order: Array<id>, frames?: json, background?, inkColor? }. Objects are stored
 * whole because they are edited whole; the merge that matters is between
 * *different* objects, so two people drawing at once keep both sets of strokes.
 *
 * Every writer (the browser's sync provider, the server's MCP tools) goes
 * through these helpers so they cannot disagree on the layout. Callers pass
 * their own `Y`: the package never imports Yjs at runtime, which would risk a
 * second copy and break class-identity checks.
 */

import type * as YjsTypes from 'yjs';

import {
  CANVAS_CONFIG_META_KEY,
  type CanvasContents,
  type CanvasEdit,
} from './edit';
import type {
  CanvasFrame,
  CanvasLayer,
  CanvasObject,
  CanvasPageSettings,
} from './model';

/** The Yjs constructors a writer needs. */
export type YjsConstructors = Pick<typeof YjsTypes, 'Map' | 'Array'>;

/** Top-level shared type holding every canvas in the project. */
export const CANVASES_KEY = 'canvases';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Page colours stored on a canvas map; absent when never set. */
function readPageSettings(
  canvas: YjsTypes.Map<unknown>,
): Partial<CanvasPageSettings> {
  const background = canvas.get('background');
  const inkColor = canvas.get('inkColor');
  const page: Partial<CanvasPageSettings> = {};
  if (typeof background === 'string') page.background = background;
  if (typeof inkColor === 'string') page.inkColor = inkColor;
  return page;
}

/** Read a canvas's shared map into plain objects, in z-order. */
export function readCanvasMap(canvas: YjsTypes.Map<unknown>): CanvasContents {
  const layers = parseJson<CanvasLayer[]>(canvas.get('layers'), []);
  const page = readPageSettings(canvas);
  // Docs predating frames have no 'frames' key — absent, not empty.
  const frames = canvas.has('frames')
    ? parseJson<CanvasFrame[]>(canvas.get('frames'), [])
    : undefined;
  const objectsMap = canvas.get('objects') as YjsTypes.Map<string> | undefined;
  const order = (
    canvas.get('order') as YjsTypes.Array<string> | undefined
  )?.toArray();

  if (!objectsMap) {
    const empty: CanvasContents = { layers, objects: [], ...page };
    if (frames !== undefined) empty.frames = frames;
    return empty;
  }

  const seen = new Set<string>();
  const objects: CanvasObject[] = [];

  for (const id of order ?? []) {
    if (seen.has(id)) continue;
    const object = parseJson<CanvasObject | null>(objectsMap.get(id), null);
    if (!object) continue;
    seen.add(id);
    objects.push(object);
  }

  // An object added by a peer whose ordering has not arrived yet still belongs
  // on the canvas — better at the top than invisible.
  for (const [id, raw] of objectsMap) {
    if (seen.has(id)) continue;
    const object = parseJson<CanvasObject | null>(raw, null);
    if (object) objects.push(object);
  }

  const contents: CanvasContents = { layers, objects, ...page };
  if (frames !== undefined) contents.frames = frames;
  return contents;
}

/** Read one canvas from a document, or `null` when nothing is stored for it. */
export function readCanvasContents(
  doc: YjsTypes.Doc,
  elementId: string,
): CanvasContents | null {
  const canvas = doc.getMap<YjsTypes.Map<unknown>>(CANVASES_KEY).get(elementId);
  return canvas ? readCanvasMap(canvas) : null;
}

/** Drop every occurrence of `id` from the z-order array. */
function removeFromOrder(order: YjsTypes.Array<string>, id: string): void {
  for (let i = order.length - 1; i >= 0; i--) {
    if (order.get(i) === id) order.delete(i, 1);
  }
}

/** Replace the z-order wholesale — only used for an explicit restack. */
function replaceOrder(order: YjsTypes.Array<string>, ids: string[]): void {
  if (
    order.length === ids.length &&
    order.toArray().every((id, i) => id === ids[i])
  ) {
    return;
  }
  order.delete(0, order.length);
  order.insert(0, ids);
}

/**
 * The Yjs client id a canvas's map is created under: a hash of the canvas's id,
 * above the 32 bits of a real client's random id. Stored documents depend on it,
 * so it can never change.
 */
function canvasCreatorId(elementId: string): number {
  let low = 0x811c9dc5;
  let high = 0x1b873593;
  for (const char of elementId) {
    const code = char.codePointAt(0) ?? 0;
    low = Math.imul(low ^ code, 0x01000193);
    high = Math.imul(high ^ code, 0x5bd1e995);
  }
  return 2 ** 32 * ((high >>> 11) | 1) + (low >>> 0);
}

/**
 * Get a canvas's map, creating it if needed.
 *
 * Yjs keeps one value per key, so if two writers each made their own map for a
 * canvas before they had synced, everything in the losing map would be thrown
 * away. So the map is created under an id only the canvas decides: every writer
 * makes the same items, which Yjs merges into one map holding both sets of
 * objects. The items and their order are part of that, so never change them.
 *
 * Those ids can only be used once. A canvas that was deleted and started again
 * is created under the writer's own id, like one from an earlier release.
 */
function ensureCanvasMap(
  Y: YjsConstructors,
  doc: YjsTypes.Doc,
  elementId: string,
): YjsTypes.Map<unknown> {
  const canvases = doc.getMap<YjsTypes.Map<unknown>>(CANVASES_KEY);
  const existing = canvases.get(elementId);
  if (existing) return existing;

  const canvas = new Y.Map<unknown>();
  const creator = canvasCreatorId(elementId);
  const ownClientId = doc.clientID;
  // Back to the writer's own id before the transaction ends and observers run.
  doc.transact(() => {
    if (!doc.store.clients.has(creator)) doc.clientID = creator;
    try {
      canvases.set(elementId, canvas);
      canvas.set('layers', '[]');
      canvas.set('objects', new Y.Map<string>());
      canvas.set('order', new Y.Array<string>());
    } finally {
      doc.clientID = ownClientId;
    }
  });
  return canvas;
}

/**
 * Write a change to a canvas, creating its map if needed. Call inside a
 * transaction so the change arrives at other peers as one update.
 */
export function writeCanvasEdit(
  Y: YjsConstructors,
  doc: YjsTypes.Doc,
  elementId: string,
  edit: CanvasEdit,
): void {
  const canvas = ensureCanvasMap(Y, doc, elementId);
  const objects = canvas.get('objects') as YjsTypes.Map<string>;
  const order = canvas.get('order') as YjsTypes.Array<string>;

  if (edit.layers) canvas.set('layers', JSON.stringify(edit.layers));
  if (edit.frames) canvas.set('frames', JSON.stringify(edit.frames));
  if (edit.background !== undefined) {
    canvas.set('background', edit.background);
  }
  if (edit.inkColor !== undefined) canvas.set('inkColor', edit.inkColor);

  for (const id of edit.deletes ?? []) {
    objects.delete(id);
    removeFromOrder(order, id);
  }

  for (const object of edit.upserts ?? []) {
    const isNew = !objects.has(object.id);
    objects.set(object.id, JSON.stringify(object));
    // Appending only new ids is what lets concurrent additions merge:
    // neither peer has to rewrite the other's ordering.
    if (isNew && !order.toArray().includes(object.id)) {
      order.push([object.id]);
    }
  }

  if (edit.order) replaceOrder(order, edit.order);
}

/** The part of an element this module needs. */
interface ElementWithMetadata {
  id: string;
  metadata?: Record<string, string>;
}

/**
 * Mirror a canvas's stored contents onto its element's `canvasConfig`
 * metadata, the interchange format that archives, templates and the
 * media-usage scan read. Call inside a transaction.
 */
export function mirrorCanvasToElement(
  doc: YjsTypes.Doc,
  elementId: string,
): void {
  const contents = readCanvasContents(doc, elementId);
  if (!contents) return;

  const elements = doc.getArray<ElementWithMetadata>('elements');
  const index = elements.toArray().findIndex((e) => e.id === elementId);
  if (index === -1) return;

  const element = elements.get(index);
  const serialized = JSON.stringify(contents);
  if (element.metadata?.[CANVAS_CONFIG_META_KEY] === serialized) return;

  elements.delete(index, 1);
  elements.insert(index, [
    {
      ...element,
      metadata: { ...element.metadata, [CANVAS_CONFIG_META_KEY]: serialized },
    },
  ]);
}
