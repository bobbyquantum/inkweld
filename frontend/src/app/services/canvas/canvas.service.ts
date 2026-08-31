/**
 * Canvas Service
 *
 * Owns the canvas being edited and its layer/object operations.
 *
 * Persistence goes through the sync provider one object at a time rather than
 * as a single serialized config, so two people drawing on the same canvas keep
 * both sets of strokes and a stroke costs a small delta instead of a rewrite
 * of the project's element array.
 *
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */

import {
  computed,
  DestroyRef,
  effect,
  type EffectRef,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { type Element } from '@inkweld/index';
import {
  type CanvasConfig,
  type CanvasFrame,
  type CanvasFrameKind,
  type CanvasLayer,
  type CanvasObject,
  type CanvasToolSettings,
  type CanvasViewport,
  createDefaultCanvasConfig,
  createDefaultLayer,
  normalizeToolSettings,
} from '@models/canvas.model';
import {
  CANVAS_CONFIG_META_KEY,
  type CanvasContents,
  diffCanvasContents,
  isEmptyCanvasEdit,
  parseCanvasContents,
} from '@models/canvas-edit';
import { UndoHistory } from '@services/canvas/canvas-history';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { nanoid } from 'nanoid';
import { type Subscription } from 'rxjs';

/** Optional parameters for createPin */
export interface PinOptions {
  color?: string;
  icon?: string;
  linkedElementId?: string;
  relationshipId?: string;
}

/** Options controlling how a config change is recorded and persisted */
export interface SaveOptions {
  /**
   * Groups rapid changes into a single undo step. Consecutive saves sharing a
   * key (a slider drag, a multi-object nudge) collapse to one entry.
   */
  coalesceKey?: string;
  /** Skip the undo stack entirely — used by undo/redo themselves. */
  skipHistory?: boolean;
}

/** Demote any canvas-size frame to a crop frame (at most one canvas size). */
function demoteCanvasFrames(frames: CanvasFrame[]): CanvasFrame[] {
  return frames.map(f =>
    f.kind === 'canvas' ? { ...f, kind: 'crop' as const } : f
  );
}

/** LocalStorage key prefix for per-user canvas viewport */
const CANVAS_STATE_BASE_PREFIX = 'inkweld-canvas-state:';

/** LocalStorage key for per-user drawing tool settings */
const CANVAS_TOOLS_BASE_KEY = 'inkweld-canvas-tools';

/**
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */
@Injectable()
export class CanvasService {
  private readonly logger = inject(LoggerService);
  private readonly injector = inject(Injector);
  private readonly projectState = inject(ProjectStateService);
  private readonly storageContext = inject(StorageContextService);
  private readonly destroyRef = inject(DestroyRef);

  // ─────────────────────────────────────────────────────────────────────────
  // Active canvas state
  // ─────────────────────────────────────────────────────────────────────────

  /** Currently active canvas config */
  private readonly activeConfigSignal = signal<CanvasConfig | null>(null);
  readonly activeConfig = this.activeConfigSignal.asReadonly();

  /** ID of the element whose config is mirrored into `activeConfigSignal`. */
  private boundElementId: string | null = null;

  /** Contents as last handed to (or received from) the sync provider. */
  private lastSyncedContents: CanvasContents | null = null;

  /** Subscription to the bound canvas's remote changes. */
  private remoteSubscription: Subscription | null = null;

  /** Waits for the project to load before reading the bound canvas. */
  private loadEffect: EffectRef | null = null;

  /** Whether the bound canvas's contents have been read yet. */
  private contentsLoaded = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Undo / redo
  // ─────────────────────────────────────────────────────────────────────────

  private readonly history = new UndoHistory<CanvasConfig>();

  /** Bumped whenever the history stack changes so the UI can re-read it. */
  private readonly historyVersion = signal(0);

  readonly canUndo = computed(() => {
    this.historyVersion();
    return this.history.canUndo;
  });

  readonly canRedo = computed(() => {
    this.historyVersion();
    return this.history.canRedo;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.unbind());
  }

  /** Undo the last local change. Returns true when something was undone. */
  undo(): boolean {
    const current = this.activeConfigSignal();
    if (!current) return false;
    const previous = this.history.undo(current);
    if (!previous) return false;
    this.applyConfig(previous);
    this.historyVersion.update(v => v + 1);
    return true;
  }

  /** Redo the most recently undone change. */
  redo(): boolean {
    const current = this.activeConfigSignal();
    if (!current) return false;
    const next = this.history.redo(current);
    if (!next) return false;
    this.applyConfig(next);
    this.historyVersion.update(v => v + 1);
    return true;
  }

  /**
   * Retained for callers that used to force a queued write out. Edits now
   * reach the sync provider as they happen, so there is nothing to flush.
   */
  flush(): void {
    // Intentionally empty: writes are no longer queued.
  }

  /** Stop tracking the current canvas. */
  private unbind(): void {
    this.remoteSubscription?.unsubscribe();
    this.remoteSubscription = null;
    this.loadEffect?.destroy();
    this.loadEffect = null;
    this.boundElementId = null;
    this.lastSyncedContents = null;
    this.contentsLoaded = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Config Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load or create a canvas config for a given element, and bind the service
   * to that element so remote metadata changes are reflected live.
   * Reads from element metadata if it exists, otherwise creates defaults.
   */
  loadConfig(elementId: string): CanvasConfig {
    this.unbind();
    this.history.clear();
    this.historyVersion.update(v => v + 1);

    this.boundElementId = elementId;
    this.activeConfigSignal.set(createDefaultCanvasConfig(elementId));
    this.tryLoadContents(elementId, this.projectState.elements());

    // A canvas tab can open before the project has finished loading, when
    // there is nothing to read yet. Wait for the element to appear rather than
    // concluding the canvas is empty — seeding an empty canvas over a
    // populated one would throw the drawing away.
    this.loadEffect = effect(
      () => {
        const elements = this.projectState.elements();
        untracked(() => this.tryLoadContents(elementId, elements));
      },
      { injector: this.injector }
    );

    // Remote-only: the provider does not echo our own edits back at us.
    this.remoteSubscription = this.projectState
      .canvasContents$(elementId)
      .subscribe(remote => this.applyRemoteContents(elementId, remote));

    return this.activeConfigSignal() ?? createDefaultCanvasConfig(elementId);
  }

  /** Read the bound canvas once its element is visible in the project. */
  private tryLoadContents(elementId: string, elements: Element[]): void {
    if (this.contentsLoaded || this.boundElementId !== elementId) return;
    if (!elements.some(e => e.id === elementId)) return;

    this.contentsLoaded = true;
    const contents = this.readOrSeedContents(elementId);
    this.lastSyncedContents = contents;
    this.activeConfigSignal.set(this.toConfig(elementId, contents));
  }

  /**
   * Read the canvas from the sync provider, seeding it the first time from the
   * legacy metadata blob so canvases created before per-object sync — or
   * restored from an archive — open with their contents intact.
   */
  private readOrSeedContents(elementId: string): CanvasContents {
    const synced = this.projectState.getCanvasContents(elementId);
    if (synced && (synced.layers.length > 0 || synced.objects.length > 0)) {
      return synced;
    }

    const element = this.projectState.elements().find(e => e.id === elementId);
    const serialized = element?.metadata?.[CANVAS_CONFIG_META_KEY];
    const legacy = parseCanvasContents(serialized);
    if (serialized && !legacy) {
      this.logger.warn('Canvas', 'Failed to parse canvas config from metadata');
    }
    const defaults = createDefaultCanvasConfig(elementId);
    const contents: CanvasContents = {
      layers: legacy?.layers.length ? legacy.layers : defaults.layers,
      objects: legacy?.objects ?? [],
    };
    if (legacy?.frames) contents.frames = legacy.frames;

    this.projectState.seedCanvasContents(elementId, contents);
    return contents;
  }

  /** Adopt contents that arrived from another peer. */
  private applyRemoteContents(
    elementId: string,
    contents: CanvasContents
  ): void {
    if (this.boundElementId !== elementId) return;

    this.contentsLoaded = true;
    this.lastSyncedContents = contents;
    this.activeConfigSignal.set(this.toConfig(elementId, contents));

    // Someone else's work landed underneath us. Every snapshot on the stack
    // predates it, so undoing one would send deletes for objects the other
    // author just added — drop the history instead.
    this.history.clear();
    this.historyVersion.update(v => v + 1);
  }

  /** Build a config, falling back to a default layer for an empty canvas. */
  private toConfig(elementId: string, contents: CanvasContents): CanvasConfig {
    const defaults = createDefaultCanvasConfig(elementId);
    return {
      elementId,
      layers: contents.layers.length > 0 ? contents.layers : defaults.layers,
      objects: contents.objects,
      frames: contents.frames,
    };
  }

  /**
   * Persist a canvas config and record the previous state on the undo stack.
   * Only the objects that actually changed are sent to the sync provider.
   * Excludes viewport (local-only state).
   */
  saveConfig(config: CanvasConfig, options?: SaveOptions): void {
    const previous = this.activeConfigSignal();
    if (previous && !options?.skipHistory) {
      this.history.push(previous, options?.coalesceKey);
      this.historyVersion.update(v => v + 1);
    }
    this.applyConfig(config);
  }

  /**
   * Push a config into local state and send only what changed to the sync
   * provider — the added, modified and removed objects rather than the whole
   * canvas.
   */
  private applyConfig(config: CanvasConfig): void {
    this.activeConfigSignal.set(config);

    const contents: CanvasContents = {
      layers: config.layers,
      objects: config.objects,
      frames: config.frames,
    };
    const edit = diffCanvasContents(this.lastSyncedContents, contents);
    this.lastSyncedContents = contents;

    if (!isEmptyCanvasEdit(edit)) {
      this.projectState.applyCanvasEdit(config.elementId, edit);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Layer Operations
  // ─────────────────────────────────────────────────────────────────────────

  /** Add a new layer and return its ID */
  addLayer(name?: string): string {
    const config = this.activeConfigSignal();
    if (!config) return '';

    const maxOrder = config.layers.reduce(
      (max, l) => Math.max(max, l.order),
      -1
    );
    const layer = createDefaultLayer(
      name ?? `Layer ${config.layers.length + 1}`,
      maxOrder + 1
    );

    this.saveConfig({
      ...config,
      layers: [...config.layers, layer],
    });
    return layer.id;
  }

  /**
   * Remove a layer and its artwork. Pins survive — they are annotations on
   * the annotations overlay, not layer content; their vestigial `layerId` is
   * reassigned so old clients (which still render pins per layer) keep
   * showing them.
   */
  removeLayer(layerId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    // Don't allow removing the last layer
    if (config.layers.length <= 1) return;

    const layers = config.layers.filter(l => l.id !== layerId);
    const fallbackLayerId = [...layers].sort((a, b) => a.order - b.order)[0].id;

    // Linked artwork on the layer dies with it — drop its relationships.
    this.cleanupRelationshipsFor(
      config.objects.filter(o => o.type !== 'pin' && o.layerId === layerId)
    );

    this.saveConfig({
      ...config,
      layers,
      objects: config.objects
        .filter(o => o.type === 'pin' || o.layerId !== layerId)
        .map(o =>
          o.type === 'pin' && o.layerId === layerId
            ? { ...o, layerId: fallbackLayerId }
            : o
        ),
    });
  }

  /** Update layer properties */
  updateLayer(layerId: string, updates: Partial<CanvasLayer>): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    this.saveConfig({
      ...config,
      layers: config.layers.map(l =>
        l.id === layerId ? { ...l, ...updates, id: layerId } : l
      ),
    });
  }

  /** Reorder layers by setting new order values */
  reorderLayers(orderedLayerIds: string[]): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    const layerMap = new Map(config.layers.map(l => [l.id, l]));
    const orderedSet = new Set(orderedLayerIds);
    const reordered = orderedLayerIds
      .map((id, idx) => {
        const layer = layerMap.get(id);
        return layer ? { ...layer, order: idx } : null;
      })
      .filter((l): l is CanvasLayer => l !== null);

    // Preserve any layers that were not included in orderedLayerIds
    if (reordered.length !== config.layers.length) {
      const missing = config.layers.filter(l => !orderedSet.has(l.id));
      reordered.push(
        ...missing.map((l, i) => ({ ...l, order: reordered.length + i }))
      );
    }

    this.saveConfig({
      ...config,
      layers: reordered,
    });
  }

  /** Get layers sorted by order (ascending — bottom layer first) */
  getSortedLayers(): CanvasLayer[] {
    const config = this.activeConfigSignal();
    if (!config) return [];
    return [...config.layers].sort((a, b) => a.order - b.order);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Frame Operations (canvas size + crop frames)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a frame. When adding a `canvas` frame, any existing canvas-size
   * frame is demoted to a crop frame in the same edit — there is at most one
   * canvas size.
   */
  addFrame(frame: CanvasFrame): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    const existing = config.frames ?? [];
    const frames =
      frame.kind === 'canvas'
        ? [...demoteCanvasFrames(existing), frame]
        : [...existing, frame];

    this.saveConfig({ ...config, frames });
  }

  /** Update frame properties. `kind` changes go through setFrameKind. */
  updateFrame(
    frameId: string,
    updates: Partial<Omit<CanvasFrame, 'id' | 'kind'>>,
    options?: SaveOptions
  ): void {
    const config = this.activeConfigSignal();
    if (!config?.frames?.some(f => f.id === frameId)) return;

    this.saveConfig(
      {
        ...config,
        frames: config.frames.map(f =>
          f.id === frameId ? { ...f, ...updates, id: frameId } : f
        ),
      },
      options
    );
  }

  /** Remove a frame. */
  removeFrame(frameId: string): void {
    const config = this.activeConfigSignal();
    if (!config?.frames?.some(f => f.id === frameId)) return;

    this.saveConfig({
      ...config,
      frames: config.frames.filter(f => f.id !== frameId),
    });
  }

  /**
   * Promote a frame to be THE canvas size (demoting any other), or demote it
   * back to a crop frame.
   */
  setFrameKind(frameId: string, kind: CanvasFrameKind): void {
    const config = this.activeConfigSignal();
    if (!config?.frames?.some(f => f.id === frameId)) return;

    const base =
      kind === 'canvas' ? demoteCanvasFrames(config.frames) : config.frames;
    this.saveConfig({
      ...config,
      frames: base.map(f => (f.id === frameId ? { ...f, kind } : f)),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Object Operations
  // ─────────────────────────────────────────────────────────────────────────

  /** Add a canvas object */
  addObject(object: CanvasObject): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    this.saveConfig({
      ...config,
      objects: [...config.objects, object],
    });
  }

  /** Remove a canvas object by ID */
  removeObject(objectId: string): void {
    this.removeObjects([objectId]);
  }

  /**
   * Remove several objects in one edit — one undo step and one write for a
   * whole eraser sweep or multi-object delete.
   *
   * This is the single choke point for object deletion (sidebar, keyboard,
   * context menu, eraser), so it also removes the relationships backing any
   * deleted linked object (pins and region shapes).
   */
  removeObjects(objectIds: string[]): void {
    const config = this.activeConfigSignal();
    if (!config || objectIds.length === 0) return;

    const doomed = new Set(objectIds);
    const objects = config.objects.filter(o => !doomed.has(o.id));
    if (objects.length === config.objects.length) return;

    this.cleanupRelationshipsFor(config.objects.filter(o => doomed.has(o.id)));
    this.saveConfig({ ...config, objects });
  }

  /** Remove the relationships backing any linked objects in `objects`. */
  private cleanupRelationshipsFor(objects: CanvasObject[]): void {
    // Resolved lazily: RelationshipService is root-provided and only needed
    // on deletions.
    let relationships: RelationshipService | null = null;
    for (const obj of objects) {
      if (!('relationshipId' in obj) || !obj.relationshipId) continue;
      relationships ??= this.injector.get(RelationshipService);
      relationships.removeRelationship(obj.relationshipId);
    }
  }

  /** Update an existing canvas object */
  updateObject(
    objectId: string,
    updates: Partial<CanvasObject>,
    options?: SaveOptions
  ): void {
    this.updateObjects([{ id: objectId, updates }], options);
  }

  /**
   * Apply updates to several objects in a single edit. Used for multi-select
   * drags and transforms, which would otherwise rewrite the project once per
   * node.
   */
  updateObjects(
    edits: { id: string; updates: Partial<CanvasObject> }[],
    options?: SaveOptions
  ): void {
    const config = this.activeConfigSignal();
    if (!config || edits.length === 0) return;

    const editMap = new Map(edits.map(e => [e.id, e.updates]));
    let changed = false;

    const objects = config.objects.map(o => {
      const updates = editMap.get(o.id);
      if (!updates) return o;
      changed = true;
      return { ...o, ...updates, id: o.id } as CanvasObject;
    });

    if (!changed) return;
    this.saveConfig({ ...config, objects }, options);
  }

  /** Move an object to a different layer */
  moveObjectToLayer(objectId: string, targetLayerId: string): void {
    this.updateObject(objectId, { layerId: targetLayerId });
  }

  /**
   * Reorder an object within its layer's z-order. Object z-order is
   * determined by position in the `objects` array — later entries render
   * on top. This method reorders only relative to other objects on the
   * same layer; objects on other layers retain their relative order.
   */
  reorderObject(
    objectId: string,
    direction: 'front' | 'back' | 'forward' | 'backward'
  ): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    const target = config.objects.find(o => o.id === objectId);
    if (!target) return;

    // Indices within the global objects array of all objects on this layer
    const layerIndices: number[] = [];
    config.objects.forEach((o, i) => {
      if (o.layerId === target.layerId) layerIndices.push(i);
    });
    const myGlobal = config.objects.findIndex(o => o.id === objectId);
    const myPos = layerIndices.indexOf(myGlobal);
    if (myPos === -1) return;

    const next = this.computeReorderedObjects(
      config.objects,
      myGlobal,
      myPos,
      layerIndices,
      direction
    );
    if (next === null) return;

    this.saveConfig({ ...config, objects: next });
  }

  private computeReorderedObjects(
    objects: CanvasObject[],
    myGlobal: number,
    myPos: number,
    layerIndices: number[],
    direction: 'front' | 'back' | 'forward' | 'backward'
  ): CanvasObject[] | null {
    if (direction === 'forward' || direction === 'backward') {
      const swapPos = direction === 'forward' ? myPos + 1 : myPos - 1;
      if (swapPos < 0 || swapPos >= layerIndices.length) return null;
      const swapGlobal = layerIndices[swapPos];
      const next = [...objects];
      [next[myGlobal], next[swapGlobal]] = [next[swapGlobal], next[myGlobal]];
      return next;
    }

    // front / back
    const targetGlobal =
      direction === 'front' ? layerIndices.at(-1) : layerIndices[0];
    if (targetGlobal === undefined || targetGlobal === myGlobal) return null;
    const next = [...objects];
    const [moved] = next.splice(myGlobal, 1);
    next.splice(targetGlobal, 0, moved);
    return next;
  }

  /** Get all objects on a specific layer */
  getObjectsForLayer(layerId: string): CanvasObject[] {
    const config = this.activeConfigSignal();
    if (!config) return [];
    return config.objects.filter(o => o.layerId === layerId);
  }

  /** Batch-update multiple object positions (e.g. after drag) */
  updateObjectPositions(
    updates: { id: string; x: number; y: number }[],
    options?: SaveOptions
  ): void {
    this.updateObjects(
      updates.map(({ id, x, y }) => ({ id, updates: { x, y } })),
      options
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pin Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Create a new pin object */
  createPin(
    layerId: string,
    x: number,
    y: number,
    label: string,
    options?: PinOptions
  ): CanvasObject {
    const {
      color = '#E53935',
      icon = 'place',
      linkedElementId,
      relationshipId,
    } = options ?? {};
    return {
      id: nanoid(),
      layerId,
      type: 'pin',
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      visible: true,
      locked: false,
      label,
      icon,
      color,
      name: label,
      linkedElementId,
      relationshipId,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local Viewport State (per-user, not synced)
  // ─────────────────────────────────────────────────────────────────────────

  /** Save viewport state to localStorage */
  saveViewport(elementId: string, viewport: CanvasViewport): void {
    try {
      const key = this.storageContext.prefixKey(
        `${CANVAS_STATE_BASE_PREFIX}${elementId}`
      );
      localStorage.setItem(key, JSON.stringify(viewport));
    } catch {
      // localStorage full or unavailable — ignore
    }
  }

  /** Load viewport state from localStorage */
  loadViewport(elementId: string): CanvasViewport | null {
    try {
      const key = this.storageContext.prefixKey(
        `${CANVAS_STATE_BASE_PREFIX}${elementId}`
      );
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as CanvasViewport;
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool Settings (per-user, shared by every canvas, not synced)
  // ─────────────────────────────────────────────────────────────────────────

  /** Persist the drawing tool settings so they survive a reload. */
  saveToolSettings(settings: CanvasToolSettings): void {
    try {
      localStorage.setItem(
        this.storageContext.prefixKey(CANVAS_TOOLS_BASE_KEY),
        JSON.stringify(settings)
      );
    } catch {
      // localStorage full or unavailable — settings just won't persist
    }
  }

  /** Load tool settings, falling back to defaults for anything missing. */
  loadToolSettings(): CanvasToolSettings {
    try {
      const raw = localStorage.getItem(
        this.storageContext.prefixKey(CANVAS_TOOLS_BASE_KEY)
      );
      return normalizeToolSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeToolSettings(null);
    }
  }
}
