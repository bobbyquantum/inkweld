/**
 * Canvas Service
 *
 * Manages canvas configuration persistence via element metadata.
 * Provides layer and object CRUD operations.
 *
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */

import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import {
  type CanvasConfig,
  type CanvasLayer,
  type CanvasObject,
  type CanvasViewport,
  createDefaultCanvasConfig,
  createDefaultLayer,
} from '@models/canvas.model';
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

/** LocalStorage key prefix for per-user canvas viewport */
const CANVAS_STATE_BASE_PREFIX = 'inkweld-canvas-state:';

/**
 * NOT provided at root — each CanvasTabComponent provides its own
 * instance so multiple canvas tabs never share config state.
 */
@Injectable()
export class CanvasService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly storageContext = inject(StorageContextService);

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
        this.applySerializedConfig(id, serialized);
      });
    });
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
    const element = this.projectState.elements().find(e => e.id === elementId);
    const serialized = element?.metadata?.[CANVAS_CONFIG_META_KEY] ?? null;
    this.applySerializedConfig(elementId, serialized);
    this.boundElementId.set(elementId);
    const config = this.activeConfigSignal();
    return config ?? createDefaultCanvasConfig(elementId);
  }

  /**
   * Save canvas config to element metadata (synced via Yjs).
   * Excludes viewport (local-only state).
   */
  saveConfig(config: CanvasConfig): void {
    this.activeConfigSignal.set(config);

    const toSerialize: Omit<CanvasConfig, 'elementId'> = {
      layers: config.layers,
      objects: config.objects,
    };
    const serialized = JSON.stringify(toSerialize);
    this.lastAppliedSerialized = serialized;

    this.projectState.updateElementMetadata(config.elementId, {
      [CANVAS_CONFIG_META_KEY]: serialized,
    });
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
    const config = this.activeConfigSignal();
    if (!config) return;

    this.saveConfig({
      ...config,
      objects: config.objects.filter(o => o.id !== objectId),
    });
  }

  /** Update an existing canvas object */
  updateObject(objectId: string, updates: Partial<CanvasObject>): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    this.saveConfig({
      ...config,
      objects: config.objects.map(o =>
        o.id === objectId
          ? ({ ...o, ...updates, id: objectId } as CanvasObject)
          : o
      ),
    });
  }

  /** Move an object to a different layer */
  moveObjectToLayer(objectId: string, targetLayerId: string): void {
    this.updateObject(objectId, { layerId: targetLayerId });
  }

  /** Get all objects on a specific layer */
  getObjectsForLayer(layerId: string): CanvasObject[] {
    const config = this.activeConfigSignal();
    if (!config) return [];
    return config.objects.filter(o => o.layerId === layerId);
  }

  /** Batch-update multiple object positions (e.g. after drag) */
  updateObjectPositions(updates: { id: string; x: number; y: number }[]): void {
    const config = this.activeConfigSignal();
    if (!config) return;

    const updateMap = new Map(updates.map(u => [u.id, u]));
    this.saveConfig({
      ...config,
      objects: config.objects.map(o => {
        const upd = updateMap.get(o.id);
        return upd ? { ...o, x: upd.x, y: upd.y } : o;
      }),
    });
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
}
