/**
 * Turns what an agent asks of `edit_canvas` into a change to write.
 *
 * Planning is pure, so the server tool and the browser tool validate the same
 * way, give the same errors and describe the result the same way. They differ
 * only in how they store the plan. Nothing is written until the whole request
 * has passed, so a bad edit never leaves a canvas half changed.
 */

import {
  baseDefaults,
  CanvasInputError,
  checkColor,
  checkFrameFields,
  checkId,
  checkLayerFields,
  fail,
  fieldCheck,
  type FieldCheck,
  isClearable,
  isMediaReference,
  isRecord,
  objectSpec,
  type ObjectSpec,
} from './agent-fields';
import {
  applyCanvasEdit,
  type CanvasContents,
  type CanvasEdit,
  isEmptyCanvasEdit,
} from './edit';
import type { CanvasLinkKind, PlannedCanvasLink } from './links';
import {
  type CanvasFrame,
  type CanvasLayer,
  type CanvasObject,
  LIGHT_PAGE,
} from './model';

/** The most objects one edit may add, update and delete in total. */
export const MAX_OBJECTS_PER_EDIT = 500;

/** Beyond this the undo arguments would cost an agent more than they are worth. */
export const MAX_UNDO_CHARS = 64 * 1024;

const EDIT_ARGUMENTS = [
  'add',
  'update',
  'delete',
  'moveToFront',
  'moveToBack',
  'layers',
  'frames',
  'background',
  'inkColor',
] as const;

export interface CanvasEditOptions {
  /** The canvas being edited; a link cannot point at it. */
  canvasElementId: string;
  createId(): string;
  /** Whether an element a pin or region links to exists in the project. */
  elementExists(elementId: string): boolean;
}

export interface CanvasEditPlan {
  /** The change to write. */
  edit: CanvasEdit;
  /** The canvas once the change is written. */
  contents: CanvasContents;
  created: string[];
  updated: string[];
  deleted: string[];
  /** Relationships to create, which the edit's objects already refer to. */
  linksToCreate: PlannedCanvasLink[];
  /** Relationships whose objects were deleted or relinked. */
  relationshipsToRemove: string[];
  /** Media references this edit places, for a host that can check them. */
  placedMedia: string[];
  /** `edit_canvas` arguments that reverse this edit, or null when too large. */
  undo: Record<string, unknown> | null;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function list(value: unknown, label: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function stringList(value: unknown, label: string): string[] {
  const items = list(value, label);
  if (items.some((item) => typeof item !== 'string')) {
    fail(`${label} must be an array of object ids`);
  }
  return items as string[];
}

function checkKnownKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      fail(`${label}.${key} is not a field here. Valid: ${allowed.join(', ')}`);
    }
  }
}

/** Run each field's check over whichever of them the input provides. */
function checkFields(
  input: Record<string, unknown>,
  checks: Record<string, FieldCheck>,
  label: string,
): void {
  for (const [key, check] of Object.entries(checks)) {
    if (input[key] !== undefined) check(input[key], `${label}.${key}`);
  }
}

function asRecord(value: CanvasObject): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

class CanvasEditPlanner {
  private readonly before: Map<string, CanvasObject>;
  private readonly objects: Map<string, CanvasObject>;
  private order: string[];
  private layers: CanvasLayer[];
  private layersChanged = false;
  private frames: CanvasFrame[] | undefined;
  private framesChanged = false;
  private background: string | undefined;
  private inkColor: string | undefined;
  private restacked = false;

  private readonly touched = new Set<string>();
  private readonly created: string[] = [];
  private updated: string[] = [];
  private readonly deleted: string[] = [];
  private readonly linksToCreate: PlannedCanvasLink[] = [];
  private readonly relationshipsToRemove: string[] = [];
  /** By object, so an object deleted later in the edit no longer counts. */
  private readonly placedMedia = new Map<string, string>();

  constructor(
    private readonly current: CanvasContents,
    private readonly options: CanvasEditOptions,
  ) {
    this.before = new Map(current.objects.map((o) => [o.id, o]));
    this.objects = new Map(this.before);
    this.order = current.objects.map((o) => o.id);
    this.layers = current.layers;
    this.frames = current.frames;
    this.background = current.background;
    this.inkColor = current.inkColor;
  }

  plan(args: Record<string, unknown>): CanvasEditPlan {
    if (!EDIT_ARGUMENTS.some((key) => isPresent(args[key]))) {
      fail(
        `Nothing to change: pass at least one of ${EDIT_ARGUMENTS.join(', ')}`,
      );
    }
    this.checkSize(args);

    this.applyPage(args);
    this.applyLayers(args['layers']);
    this.applyFrames(args['frames']);
    // Updates first, so a delete can follow an unlock in the same edit.
    this.applyUpdates(args['update']);
    this.applyDeletes(args['delete']);
    this.applyAdds(args['add']);
    this.settleRemovedLayers();
    this.restack(args['moveToBack'], 'moveToBack');
    this.restack(args['moveToFront'], 'moveToFront');

    const edit = this.buildEdit();
    if (isEmptyCanvasEdit(edit)) fail('Nothing to change: this is already so.');
    return {
      edit,
      contents: applyCanvasEdit(this.current, edit),
      created: this.created,
      updated: this.updated,
      deleted: this.deleted,
      linksToCreate: this.linksToCreate,
      relationshipsToRemove: this.relationshipsToRemove,
      placedMedia: [...new Set(this.placedMedia.values())],
      undo: this.buildUndo(),
    };
  }

  private checkSize(args: Record<string, unknown>): void {
    const count =
      list(args['add'], 'add').length +
      list(args['update'], 'update').length +
      list(args['delete'], 'delete').length;
    if (count > MAX_OBJECTS_PER_EDIT) {
      fail(
        `One edit can change at most ${MAX_OBJECTS_PER_EDIT} objects (got ${count}); split it up`,
      );
    }
  }

  private applyPage(args: Record<string, unknown>): void {
    if (isPresent(args['background'])) {
      checkColor(args['background'], 'background');
      this.background = args['background'] as string;
    }
    if (isPresent(args['inkColor'])) {
      checkColor(args['inkColor'], 'inkColor');
      this.inkColor = args['inkColor'] as string;
    }
  }

  private applyLayers(raw: unknown): void {
    if (isPresent(raw)) {
      const inputs = list(raw, 'layers');
      if (inputs.length === 0) fail('layers must hold at least one layer');
      const existing = new Map(this.current.layers.map((l) => [l.id, l]));
      const seen = new Set<string>();
      this.layers = inputs.map((input, index) =>
        this.parseLayer(input, index, existing, seen),
      );
      this.layersChanged = true;
    }
    if (this.layers.length === 0) {
      // Never opened in the app, so nothing has made its first layer yet.
      this.layers = [this.newLayer('Layer 1', 0)];
      this.layersChanged = true;
    }
  }

  private newLayer(name: string, order: number): CanvasLayer {
    return {
      id: this.options.createId(),
      name,
      visible: true,
      locked: false,
      opacity: 1,
      order,
    };
  }

  private parseLayer(
    input: unknown,
    index: number,
    existing: Map<string, CanvasLayer>,
    seen: Set<string>,
  ): CanvasLayer {
    const label = `layers[${index}]`;
    if (!isRecord(input)) fail(`${label} must be an object`);
    checkKnownKeys(
      input,
      ['id', 'order', ...Object.keys(checkLayerFields)],
      label,
    );
    checkFields(input, checkLayerFields, label);

    const id = input['id'] ?? this.options.createId();
    checkId(id, `${label}.id`);
    if (seen.has(id)) fail(`${label}.id "${id}" appears twice`);
    seen.add(id);

    const previous = existing.get(id);
    const name = input['name'] ?? previous?.name;
    if (typeof name !== 'string') fail(`${label}.name is required`);
    return {
      visible: true,
      locked: false,
      opacity: 1,
      ...previous,
      ...(input as Partial<CanvasLayer>),
      id,
      name,
      // Array position is the stacking order, whatever `order` says.
      order: index,
    };
  }

  private applyFrames(raw: unknown): void {
    if (!isPresent(raw)) return;
    const existing = new Map((this.current.frames ?? []).map((f) => [f.id, f]));
    const seen = new Set<string>();
    const frames = list(raw, 'frames').map((input, index) =>
      this.parseFrame(input, index, existing, seen),
    );
    if (frames.filter((f) => f.kind === 'canvas').length > 1) {
      fail('frames can hold at most one frame of kind "canvas"');
    }
    this.frames = frames;
    this.framesChanged = true;
  }

  private parseFrame(
    input: unknown,
    index: number,
    existing: Map<string, CanvasFrame>,
    seen: Set<string>,
  ): CanvasFrame {
    const label = `frames[${index}]`;
    if (!isRecord(input)) fail(`${label} must be an object`);
    checkKnownKeys(input, ['id', ...Object.keys(checkFrameFields)], label);
    checkFields(input, checkFrameFields, label);

    const id = input['id'] ?? this.options.createId();
    checkId(id, `${label}.id`);
    if (seen.has(id)) fail(`${label}.id "${id}" appears twice`);
    seen.add(id);

    const merged: Record<string, unknown> = {
      kind: 'crop',
      visible: true,
      ...existing.get(id),
      ...input,
      id,
    };
    for (const key of ['name', 'x', 'y', 'width', 'height']) {
      if (merged[key] === undefined) fail(`${label}.${key} is required`);
    }
    return merged as unknown as CanvasFrame;
  }

  private layerOf(object: CanvasObject): CanvasLayer | undefined {
    return this.layers.find((l) => l.id === object.layerId);
  }

  /**
   * A layer holds its objects still for as long as it stays locked. They can
   * change in the edit that unlocks it, and in the edit that locks it, which is
   * what undoing the first of those does.
   */
  private holdsObjects(layer: CanvasLayer): boolean {
    return (
      layer.locked &&
      this.current.layers.some((l) => l.id === layer.id && l.locked)
    );
  }

  /** Respect the user's locks. An explicit unlock in the same update is fine. */
  private assertUnlocked(
    object: CanvasObject,
    label: string,
    patch?: Record<string, unknown>,
  ): void {
    if (object.locked && patch?.['locked'] !== false) {
      fail(
        `${label}: object "${object.id}" is locked; set locked to false in an update to change it`,
      );
    }
    const layer = this.layerOf(object);
    // Pins sit on an annotations overlay; their layerId is vestigial.
    if (layer && this.holdsObjects(layer) && object.type !== 'pin') {
      fail(
        `${label}: object "${object.id}" is on locked layer "${layer.name}"; unlock the layer with the layers argument`,
      );
    }
  }

  private applyDeletes(raw: unknown): void {
    const ids = stringList(raw, 'delete');
    for (const id of ids) {
      const object = this.objects.get(id);
      if (!object) fail(`delete: no object with id "${id}"`);
      this.assertUnlocked(object, 'delete');
      const relationshipId = asRecord(object)['relationshipId'];
      if (typeof relationshipId === 'string') {
        this.relationshipsToRemove.push(relationshipId);
      }
      this.objects.delete(id);
      this.touched.delete(id);
      this.placedMedia.delete(id);
      this.deleted.push(id);
    }
    const gone = new Set(ids);
    this.order = this.order.filter((id) => !gone.has(id));
    this.updated = this.updated.filter((id) => !gone.has(id));
  }

  private applyUpdates(raw: unknown): void {
    for (const [index, input] of list(raw, 'update').entries()) {
      this.applyUpdate(input, `update[${index}]`);
    }
  }

  private applyUpdate(input: unknown, label: string): void {
    if (!isRecord(input)) fail(`${label} must be an object with an id`);
    const id = input['id'];
    if (typeof id !== 'string') fail(`${label}.id is required`);
    const existing = this.objects.get(id);
    if (!existing) fail(`${label}: no object with id "${id}"`);
    if (this.touched.has(id)) fail(`${label}: object "${id}" is updated twice`);
    if (input['type'] !== undefined && input['type'] !== existing.type) {
      fail(`${label}: an object cannot change type (it is a ${existing.type})`);
    }
    this.assertUnlocked(existing, label, input);

    const spec = objectSpec(existing.type, label);
    const next: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(input)) {
      this.applyField(next, spec, key, value, label);
    }
    spec.finish?.(next, label);
    this.planLink(next, asRecord(existing), label);
    this.notePlacedMedia(next, asRecord(existing));

    this.objects.set(id, next as unknown as CanvasObject);
    this.touched.add(id);
    this.updated.push(id);
  }

  private applyField(
    next: Record<string, unknown>,
    spec: ObjectSpec,
    key: string,
    value: unknown,
    label: string,
  ): void {
    // Managed here, or fixed: accepted so a read object can be sent back as is.
    if (key === 'id' || key === 'type' || key === 'relationshipId') return;
    if (key === 'layerId') {
      next['layerId'] = this.resolveLayer(value, next['type'], label);
      return;
    }
    const check = fieldCheck(spec, key, label);
    if (value === null) {
      if (!isClearable(spec, key)) {
        fail(`${label}.${key} cannot be cleared`);
      }
      delete next[key];
      return;
    }
    check(value, `${label}.${key}`);
    next[key] = value;
  }

  /** A layer to put an object on, by id or the topmost that can take it. */
  private resolveLayer(value: unknown, type: unknown, label: string): string {
    if (value === undefined || value === null) return this.defaultLayer(label);
    const layer = this.layers.find((l) => l.id === value);
    if (!layer) {
      const known = this.layers.map((l) => `${l.id} (${l.name})`).join(', ');
      fail(`${label}.layerId: no such layer. Layers: ${known}`);
    }
    if (this.holdsObjects(layer) && type !== 'pin') {
      fail(`${label}.layerId: layer "${layer.name}" is locked`);
    }
    return layer.id;
  }

  private defaultLayer(label: string): string {
    const layer = [...this.layers]
      .sort((a, b) => b.order - a.order)
      .find((l) => l.visible && !l.locked);
    if (!layer) {
      fail(
        `${label}: every layer is hidden or locked; pass layerId, or change the layers`,
      );
    }
    return layer.id;
  }

  /** Plan the relationship changes that keep a link's backing up to date. */
  private planLink(
    next: Record<string, unknown>,
    previous: Record<string, unknown> | null,
    label: string,
  ): void {
    const target = next['linkedElementId'];
    if (target === previous?.['linkedElementId']) return;

    if (typeof previous?.['relationshipId'] === 'string') {
      this.relationshipsToRemove.push(previous['relationshipId']);
    }
    delete next['relationshipId'];
    if (typeof target !== 'string') return;

    if (target === this.options.canvasElementId) {
      fail(`${label}.linkedElementId: a canvas cannot link to itself`);
    }
    if (!this.options.elementExists(target)) {
      fail(`${label}.linkedElementId: no element with id "${target}"`);
    }
    const relationshipId = this.options.createId();
    next['relationshipId'] = relationshipId;
    const kind: CanvasLinkKind = next['type'] === 'pin' ? 'pin' : 'area';
    this.linksToCreate.push({
      objectId: next['id'] as string,
      kind,
      targetElementId: target,
      relationshipId,
    });
  }

  private notePlacedMedia(
    next: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ): void {
    const src = next['src'];
    if (
      typeof src === 'string' &&
      src !== previous?.['src'] &&
      isMediaReference(src)
    ) {
      this.placedMedia.set(next['id'] as string, src);
    }
  }

  private applyAdds(raw: unknown): void {
    for (const [index, input] of list(raw, 'add').entries()) {
      this.applyAdd(input, `add[${index}]`);
    }
  }

  private applyAdd(input: unknown, label: string): void {
    if (!isRecord(input)) fail(`${label} must be an object`);
    const spec = objectSpec(input['type'], label);
    for (const key of spec.required) {
      if (input[key] === undefined || input[key] === null) {
        fail(`${label}.${key} is required for a ${String(input['type'])}`);
      }
    }

    const id = input['id'] ?? this.options.createId();
    checkId(id, `${label}.id`);
    if (this.objects.has(id)) fail(`${label}.id "${id}" is already in use`);

    const next: Record<string, unknown> = {
      ...baseDefaults(),
      ...spec.defaults(this.inkColor ?? LIGHT_PAGE.inkColor),
      id,
      type: input['type'],
      layerId: this.resolveLayer(input['layerId'], input['type'], label),
    };
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'layerId' && value !== null) {
        this.applyField(next, spec, key, value, label);
      }
    }
    if (spec.nameFrom) {
      next['name'] ??= String(next[spec.nameFrom]).substring(0, 30);
    }
    spec.finish?.(next, label);
    this.planLink(next, null, label);
    this.notePlacedMedia(next, null);

    this.objects.set(id, next as unknown as CanvasObject);
    this.order.push(id);
    this.touched.add(id);
    this.created.push(id);
  }

  /**
   * A removed layer must not strand its artwork. Pins survive, as when the app
   * removes a layer: they are annotations, so they only need a layer that
   * exists.
   */
  private settleRemovedLayers(): void {
    const remaining = new Set(this.layers.map((l) => l.id));
    const removed = this.current.layers.filter((l) => !remaining.has(l.id));
    if (removed.length === 0) return;

    const fallback = [...this.layers].sort((a, b) => a.order - b.order)[0].id;
    for (const layer of removed) {
      const left = [...this.objects.values()].filter(
        (o) => o.layerId === layer.id,
      );
      const artwork = left.filter((o) => o.type !== 'pin').length;
      if (artwork > 0) {
        fail(
          `layers: layer "${layer.name}" still holds ${artwork} objects; delete them or move them to another layer in this edit`,
        );
      }
      for (const pin of left) {
        this.objects.set(pin.id, { ...pin, layerId: fallback });
        this.touched.add(pin.id);
        if (!this.updated.includes(pin.id)) this.updated.push(pin.id);
      }
    }
  }

  private restack(raw: unknown, argument: 'moveToFront' | 'moveToBack'): void {
    const ids = stringList(raw, argument);
    if (ids.length === 0) return;
    for (const id of ids) {
      if (!this.objects.has(id)) fail(`${argument}: no object with id "${id}"`);
    }
    const moved = new Set(ids);
    if (moved.size !== ids.length) fail(`${argument} holds an id twice`);
    const rest = this.order.filter((id) => !moved.has(id));
    this.order =
      argument === 'moveToFront' ? [...rest, ...ids] : [...ids, ...rest];
    this.restacked = true;
  }

  private buildEdit(): CanvasEdit {
    const edit: CanvasEdit = {};
    if (this.layersChanged) edit.layers = this.layers;
    if (this.framesChanged) edit.frames = this.frames;
    if (this.background !== this.current.background) {
      edit.background = this.background;
    }
    if (this.inkColor !== this.current.inkColor) edit.inkColor = this.inkColor;
    if (this.touched.size > 0) {
      edit.upserts = [...this.touched].map(
        (id) => this.objects.get(id) as CanvasObject,
      );
    }
    if (this.deleted.length > 0) edit.deletes = this.deleted;
    if (this.restacked) edit.order = this.order;
    return edit;
  }

  private buildUndo(): Record<string, unknown> | null {
    const undo: Record<string, unknown> = {};
    if (this.created.length > 0) undo['delete'] = this.created;
    if (this.deleted.length > 0) {
      undo['add'] = this.deleted.map((id) =>
        withoutRelationship(this.before.get(id)),
      );
    }
    const patches = [
      // Otherwise the delete above would be refused for what it is deleting.
      ...this.created
        .filter((id) => this.objects.get(id)?.locked)
        .map((id) => ({ id, locked: false })),
      ...this.updated
        .filter((id) => this.before.has(id))
        .map((id) =>
          undoPatch(
            asRecord(this.before.get(id) as CanvasObject),
            asRecord(this.objects.get(id) as CanvasObject),
          ),
        ),
    ];
    if (patches.length > 0) undo['update'] = patches;
    // A canvas that had no layers keeps the first one it was given.
    if (this.layersChanged && this.current.layers.length > 0) {
      undo['layers'] = this.current.layers;
    }
    if (this.framesChanged) undo['frames'] = this.current.frames ?? [];
    if (
      this.background !== this.current.background &&
      this.current.background
    ) {
      undo['background'] = this.current.background;
    }
    if (this.inkColor !== this.current.inkColor && this.current.inkColor) {
      undo['inkColor'] = this.current.inkColor;
    }
    // Re-adding a deleted object puts it on top, so the stack must be restored.
    if (this.restacked || this.deleted.length > 0) {
      undo['moveToFront'] = this.current.objects.map((o) => o.id);
    }
    if (JSON.stringify(undo).length > MAX_UNDO_CHARS) return null;
    return Object.keys(undo).length > 0 ? undo : null;
  }
}

/** A deleted object as `add` takes it; its link gets a new relationship. */
function withoutRelationship(
  object: CanvasObject | undefined,
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...object };
  delete copy['relationshipId'];
  return copy;
}

/** The fields to send back to an object to return it to how it was. */
function undoPatch(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { id: before['id'] };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === 'relationshipId') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      patch[key] = before[key] ?? null;
    }
  }
  return patch;
}

/**
 * Plan an edit of a canvas. `args` are the tool's arguments; anything but the
 * edit's own (the project, the element id) is ignored. Returns `{ error }` for
 * a request that cannot be carried out, with nothing changed.
 */
export function planCanvasEdit(
  current: CanvasContents,
  args: Record<string, unknown>,
  options: CanvasEditOptions,
): CanvasEditPlan | { error: string } {
  try {
    return new CanvasEditPlanner(current, options).plan(args);
  } catch (error) {
    if (error instanceof CanvasInputError) return { error: error.message };
    throw error;
  }
}

/** The result an agent gets back: the same fields from both tools. */
export function describeCanvasEdit(
  elementId: string,
  elementName: string,
  plan: CanvasEditPlan,
): Record<string, unknown> {
  return {
    success: true,
    elementId,
    elementName,
    created: plan.created,
    updated: plan.updated,
    deleted: plan.deleted,
    objectCount: plan.contents.objects.length,
    layers: plan.contents.layers.map((l) => ({ id: l.id, name: l.name })),
    ...(plan.undo
      ? { undo: plan.undo }
      : {
          note: 'No undo arguments are included: this edit is too large to reverse that way, or there is no earlier value to return to, as with a first page colour or a first layer.',
        }),
  };
}
