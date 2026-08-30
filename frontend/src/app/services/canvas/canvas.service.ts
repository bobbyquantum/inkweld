/**
 * Canvas Service
 *
 * Manages canvas configuration persistence via element metadata.
 * Provides layer and object CRUD operations.
 *
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */

import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
} from '@angular/core';
import {
  type CanvasConfig,
  type CanvasLayer,
  type CanvasObject,
  type CanvasToolSettings,
  type CanvasViewport,
  createDefaultCanvasConfig,
  createDefaultLayer,
  normalizeToolSettings,
} from '@models/canvas.model';
import { UndoHistory } from '@services/canvas/canvas-history';
import { LoggerService } from '@services/core/logger.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { nanoid } from 'nanoid';

/** Key used to store serialized canvas config in element metadata */
const CANVAS_CONFIG_META_KEY = 'canvasConfig';

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

/** LocalStorage key prefix for per-user canvas viewport */
const CANVAS_STATE_BASE_PREFIX = 'inkweld-canvas-state:';

/** LocalStorage key for per-user drawing tool settings */
const CANVAS_TOOLS_BASE_KEY = 'inkweld-canvas-tools';

/**
 * Minimum gap between metadata writes. A canvas edit rewrites the project's
 * whole element array, so bursts (a flurry of strokes, an eraser sweep, a
 * multi-object drag) are throttled into a leading write plus one trailing
 * write instead of one per mutation. Local state is never delayed — only the
 * trip through Yjs is.
 */
const PERSIST_INTERVAL_MS = 200;

/**
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */
@Injectable()
export class CanvasService {
  private readonly logger = inject(LoggerService);
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
  private readonly boundElementId = signal<string | null>(null);

  /**
   * Last serialized config we either wrote via `saveConfig` or applied from
   * remote metadata. Used to short-circuit echoes of our own writes so we
   * don't re-parse identical JSON every time the elements signal emits.
   */
  private lastAppliedSerialized: string | null = null;

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

  // ─────────────────────────────────────────────────────────────────────────
  // Throttled persistence
  // ─────────────────────────────────────────────────────────────────────────

  private pendingWrite: { elementId: string; serialized: string } | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // React to remote updates to the bound element's metadata. When another
    // user edits the canvas, ProjectStateService re-emits `elements()` with
    // the new metadata JSON; we re-parse and update `activeConfigSignal` so
    // the canvas view reflects the change in real time.
    effect(() => {
      const id = this.boundElementId();
      if (!id) return;
      const elements = this.projectState.elements();
      const element = elements.find(e => e.id === id);
      const serialized = element?.metadata?.[CANVAS_CONFIG_META_KEY] ?? null;
      if (serialized === this.lastAppliedSerialized) return;
      untracked(() => {
        // A local edit is still queued: our state is the newer one, so push it
        // out rather than letting a stale snapshot overwrite work in progress.
        if (this.pendingWrite) {
          this.flush();
          return;
        }
        this.applySerializedConfig(id, serialized);
        // Remote work landed underneath us. Every snapshot on the stack
        // predates it, so undoing one would write back a config that silently
        // drops the other author's changes — drop the history instead.
        this.history.clear();
        this.historyVersion.update(v => v + 1);
      });
    });

    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') this.flush();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', flushOnHide);
      this.flush();
    });
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

  /** Push any queued metadata write out immediately. */
  flush(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.writePending();
  }

  private writePending(): void {
    const pending = this.pendingWrite;
    this.pendingWrite = null;
    if (!pending) return;
    this.projectState.updateElementMetadata(pending.elementId, {
      [CANVAS_CONFIG_META_KEY]: pending.serialized,
    });
  }

  /**
   * Queue a metadata write. The first change in a burst goes out immediately
   * so collaborators see it without delay; anything that piles up behind it is
   * collapsed into a single trailing write.
   */
  private schedulePersist(elementId: string, serialized: string): void {
    this.pendingWrite = { elementId, serialized };

    if (this.persistTimer !== null) return;

    this.writePending();
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const pending = this.pendingWrite;
      if (pending) this.schedulePersist(pending.elementId, pending.serialized);
    }, PERSIST_INTERVAL_MS);
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
    this.flush();
    this.history.clear();
    this.historyVersion.update(v => v + 1);

    const element = this.projectState.elements().find(e => e.id === elementId);
    const serialized = element?.metadata?.[CANVAS_CONFIG_META_KEY] ?? null;
    this.applySerializedConfig(elementId, serialized);
    this.boundElementId.set(elementId);
    const config = this.activeConfigSignal();
    return config ?? createDefaultCanvasConfig(elementId);
  }

  /**
   * Save canvas config to element metadata (synced via Yjs) and record the
   * previous state on the undo stack.
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

  /** Push a config into local state and queue it for persistence. */
  private applyConfig(config: CanvasConfig): void {
    this.activeConfigSignal.set(config);

    const toSerialize: Omit<CanvasConfig, 'elementId'> = {
      layers: config.layers,
      objects: config.objects,
    };
    const serialized = JSON.stringify(toSerialize);
    this.lastAppliedSerialized = serialized;

    this.schedulePersist(config.elementId, serialized);
  }

  /**
   * Parse a serialized config from element metadata and push it into
   * `activeConfigSignal`. Falls back to defaults when `serialized` is null
   * or unparseable. Also stamps `lastAppliedSerialized` so subsequent echoes
   * of the same payload are skipped.
   */
  private applySerializedConfig(
    elementId: string,
    serialized: string | null
  ): void {
    this.lastAppliedSerialized = serialized;

    if (serialized) {
      try {
        const parsed = JSON.parse(serialized) as Partial<CanvasConfig>;
        const defaults = createDefaultCanvasConfig(elementId);
        const config: CanvasConfig = {
          ...defaults,
          ...parsed,
          elementId,
        };
        if (!Array.isArray(config.layers) || config.layers.length === 0) {
          config.layers = defaults.layers;
        }
        if (!Array.isArray(config.objects)) {
          config.objects = [];
        }
        this.activeConfigSignal.set(config);
        return;
      } catch {
        this.logger.warn(
          'Canvas',
          'Failed to parse canvas config from metadata'
        );
      }
    }

    this.activeConfigSignal.set(createDefaultCanvasConfig(elementId));
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

  /** Remove a layer and all its objects */
  removeLayer(layerId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    // Don't allow removing the last layer
    if (config.layers.length <= 1) return;

    this.saveConfig({
      ...config,
      layers: config.layers.filter(l => l.id !== layerId),
      objects: config.objects.filter(o => o.layerId !== layerId),
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
   */
  removeObjects(objectIds: string[]): void {
    const config = this.activeConfigSignal();
    if (!config || objectIds.length === 0) return;

    const doomed = new Set(objectIds);
    const objects = config.objects.filter(o => !doomed.has(o.id));
    if (objects.length === config.objects.length) return;

    this.saveConfig({ ...config, objects });
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
