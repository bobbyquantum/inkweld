/**
 * Timeline Service
 *
 * Manages timeline configuration persistence via element metadata. Provides
 * CRUD operations for tracks, events, and eras. Mirrors {@link CanvasService}:
 * not provided at root — each {@link TimelineTabComponent} provides its own
 * instance so multiple open timelines never share state.
 */

import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { type ElementTypeSchema, type FieldSchema } from '@models/schema-types';
import {
  normalizeTimePoint,
  parseTimePoint,
  type TimeSystem,
} from '@models/time-system';
import {
  createDefaultTimelineConfig,
  pickNextColor,
  TIMELINE_CONFIG_VERSION,
  type TimelineConfig,
  type TimelineEra,
  type TimelineEvent,
  type TimelineTrack,
} from '@models/timeline.model';
import { LoggerService } from '@services/core/logger.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { nanoid } from 'nanoid';

/** Key used to store the serialized timeline config in element metadata */
export const TIMELINE_CONFIG_META_KEY = 'timelineConfig';

@Injectable()
export class TimelineService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly library = inject(TimeSystemLibraryService);
  private readonly worldbuilding = inject(WorldbuildingService);

  // ─────────────────────────────────────────────────────────────────────────
  // Active timeline state
  // ─────────────────────────────────────────────────────────────────────────

  private readonly activeConfigSignal = signal<TimelineConfig | null>(null);
  readonly activeConfig = this.activeConfigSignal.asReadonly();

  /** ID of the element whose config is mirrored into `activeConfigSignal`. */
  private readonly boundElementId = signal<string | null>(null);

  /**
   * Last serialized config we either wrote via `saveConfig` or applied from
   * remote metadata. Used to short-circuit echoes of our own writes.
   */
  private lastAppliedSerialized: string | null = null;

  constructor() {
    // React to remote updates to the bound element's metadata. When another
    // collaborator edits the timeline, the elements signal re-emits and we
    // re-parse the new metadata into `activeConfigSignal`.
    effect(() => {
      const id = this.boundElementId();
      if (!id) return;
      const elements = this.projectState.elements();
      const element = elements.find(e => e.id === id);
      const serialized = element?.metadata?.[TIMELINE_CONFIG_META_KEY] ?? null;
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
   * Load or create a timeline config for a given element, and bind the
   * service to that element so remote metadata edits re-render live. Reads
   * from element metadata if it exists; otherwise creates defaults.
   */
  loadConfig(elementId: string): TimelineConfig {
    const element = this.projectState.elements().find(e => e.id === elementId);
    const serialized = element?.metadata?.[TIMELINE_CONFIG_META_KEY] ?? null;
    this.applySerializedConfig(elementId, serialized);
    this.boundElementId.set(elementId);
    return this.activeConfigSignal() ?? createDefaultTimelineConfig(elementId);
  }

  /** Persist config to element metadata (synced via Yjs). */
  saveConfig(config: TimelineConfig): void {
    this.activeConfigSignal.set(config);

    const toSerialize: Omit<TimelineConfig, 'elementId'> = {
      version: config.version,
      timeSystemId: config.timeSystemId,
      tracks: config.tracks,
      events: config.events,
      eras: config.eras,
    };
    const serialized = JSON.stringify(toSerialize);
    this.lastAppliedSerialized = serialized;

    this.projectState.updateElementMetadata(config.elementId, {
      [TIMELINE_CONFIG_META_KEY]: serialized,
    });
  }

  /**
   * Parse a serialized config from element metadata and push it into
   * `activeConfigSignal`. Falls back to defaults when `serialized` is null
   * or unparseable. Also stamps `lastAppliedSerialized` so echoes are
   * skipped.
   */
  private applySerializedConfig(
    elementId: string,
    serialized: string | null
  ): void {
    this.lastAppliedSerialized = serialized;

    if (serialized) {
      try {
        const parsed = JSON.parse(serialized) as Partial<TimelineConfig>;
        const defaults = createDefaultTimelineConfig(elementId);
        const config: TimelineConfig = {
          ...defaults,
          ...parsed,
          version: TIMELINE_CONFIG_VERSION,
          elementId,
          tracks:
            Array.isArray(parsed.tracks) && parsed.tracks.length > 0
              ? parsed.tracks
              : defaults.tracks,
          events: Array.isArray(parsed.events) ? parsed.events : [],
          eras: Array.isArray(parsed.eras) ? parsed.eras : [],
          timeSystemId: parsed.timeSystemId ?? defaults.timeSystemId,
        };
        this.activeConfigSignal.set(this.normalizeConfigTimePoints(config));
        return;
      } catch {
        this.logger.warn(
          'Timeline',
          'Failed to parse timeline config from metadata; using defaults'
        );
      }
    }

    this.activeConfigSignal.set(createDefaultTimelineConfig(elementId));
  }

  private normalizeConfigTimePoints(config: TimelineConfig): TimelineConfig {
    const system = this.library.resolveSystem(config.timeSystemId);
    if (!system) return config;

    return {
      ...config,
      events: config.events.map(event => this.normalizeEvent(event, system)),
      eras: config.eras.map(era => this.normalizeEra(era, system)),
    };
  }

  private normalizeEvent(
    event: TimelineEvent,
    system: TimeSystem
  ): TimelineEvent {
    return {
      ...event,
      start: normalizeTimePoint(event.start, system) ?? event.start,
      ...(event.end
        ? { end: normalizeTimePoint(event.end, system) ?? event.end }
        : {}),
    };
  }

  private normalizeEra(era: TimelineEra, system: TimeSystem): TimelineEra {
    return {
      ...era,
      start: normalizeTimePoint(era.start, system) ?? era.start,
      end: normalizeTimePoint(era.end, system) ?? era.end,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Time system
  // ─────────────────────────────────────────────────────────────────────────

  /** All time systems installed in the current project. */
  getAvailableSystems(): readonly TimeSystem[] {
    return this.library.systems();
  }

  /**
   * Resolve the active {@link TimeSystem}. Returns null if no system is
   * selected OR if the referenced system is not installed in this project.
   */
  getActiveSystem(): TimeSystem | null {
    const config = this.activeConfigSignal();
    if (!config?.timeSystemId) return null;
    return this.library.resolveSystem(config.timeSystemId);
  }

  setTimeSystem(systemId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    // Allow empty string to clear; otherwise require an installed system.
    if (systemId && !this.library.findSystem(systemId)) return;
    if (config.timeSystemId === systemId) return;
    this.saveConfig({ ...config, timeSystemId: systemId });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Track operations
  // ─────────────────────────────────────────────────────────────────────────

  addTrack(name?: string): string {
    const config = this.activeConfigSignal();
    if (!config) return '';
    const order = config.tracks.reduce((m, t) => Math.max(m, t.order), -1) + 1;
    const track: TimelineTrack = {
      id: nanoid(),
      name: name ?? `Track ${config.tracks.length + 1}`,
      color: pickNextColor(order),
      visible: true,
      order,
    };
    this.saveConfig({ ...config, tracks: [...config.tracks, track] });
    return track.id;
  }

  removeTrack(trackId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    if (config.tracks.length <= 1) return;
    this.saveConfig({
      ...config,
      tracks: config.tracks.filter(t => t.id !== trackId),
      events: config.events.filter(e => e.trackId !== trackId),
    });
  }

  updateTrack(trackId: string, updates: Partial<TimelineTrack>): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.saveConfig({
      ...config,
      tracks: config.tracks.map(t =>
        t.id === trackId ? { ...t, ...updates, id: trackId } : t
      ),
    });
  }

  getSortedTracks(): TimelineTrack[] {
    const config = this.activeConfigSignal();
    if (!config) return [];
    return [...config.tracks].sort((a, b) => a.order - b.order);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event operations
  // ─────────────────────────────────────────────────────────────────────────

  addEvent(event: Omit<TimelineEvent, 'id'>): string {
    const config = this.activeConfigSignal();
    if (!config) return '';
    const id = nanoid();
    this.saveConfig({
      ...config,
      events: [...config.events, { ...event, id }],
    });
    return id;
  }

  updateEvent(eventId: string, updates: Partial<TimelineEvent>): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    const system = this.library.resolveSystem(config.timeSystemId);
    this.saveConfig({
      ...config,
      events: config.events.map(e => {
        if (e.id !== eventId) return e;
        const next = { ...e, ...updates, id: eventId };
        return system ? this.normalizeEvent(next, system) : next;
      }),
    });
  }

  removeEvent(eventId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.saveConfig({
      ...config,
      events: config.events.filter(e => e.id !== eventId),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Era operations
  // ─────────────────────────────────────────────────────────────────────────

  addEra(era: Omit<TimelineEra, 'id'>): string {
    const config = this.activeConfigSignal();
    if (!config) return '';
    const id = nanoid();
    this.saveConfig({ ...config, eras: [...config.eras, { ...era, id }] });
    return id;
  }

  updateEra(eraId: string, updates: Partial<TimelineEra>): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    const system = this.library.resolveSystem(config.timeSystemId);
    this.saveConfig({
      ...config,
      eras: config.eras.map(era => {
        if (era.id !== eraId) return era;
        const next = { ...era, ...updates, id: eraId };
        return system ? this.normalizeEra(next, system) : next;
      }),
    });
  }

  removeEra(eraId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    this.saveConfig({
      ...config,
      eras: config.eras.filter(era => era.id !== eraId),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Orphan cleanup
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Called when an element is deleted project-wide. Any event whose
   * `linkedElementId` points to the removed element has the link cleared.
   */
  clearLinksToElement(deletedElementId: string): void {
    const config = this.activeConfigSignal();
    if (!config) return;
    let touched = false;
    const events = config.events.map(event => {
      if (event.linkedElementId === deletedElementId) {
        touched = true;
        const { linkedElementId: _removed, ...rest } = event;
        return rest;
      }
      return event;
    });
    if (touched) this.saveConfig({ ...config, events });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-build from element date fields
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scan every worldbuilding element in the project, read each schema field
   * of type `date`, parse the stored value into a {@link TimePoint} in the
   * timeline's active {@link TimeSystem}, and create/update a
   * `source: 'auto'` event per field.
   *
   * Idempotent: existing auto-built events are replaced in place keyed on
   * `(linkedElementId, sourceFieldKey)`. Manually-authored events
   * (`source: 'manual'` or unset) are never touched. Auto-built events whose
   * source field no longer has a date value are removed.
   *
   * @param username Project username (for Yjs per-element docs).
   * @param slug     Project slug.
   * @returns A summary of the run, or `null` if the timeline has no active
   *          time system or no bound config.
   */
  async autoBuildFromElements(
    username: string,
    slug: string
  ): Promise<{
    created: number;
    updated: number;
    removed: number;
    skipped: number;
  } | null> {
    const config = this.activeConfigSignal();
    if (!config) return null;
    const system = this.getActiveSystem();
    if (!system) return null;

    try {
      const worldbuildingElements = this.projectState
        .elements()
        .filter(e => e.type === ElementType.Worldbuilding);

      const summary = { created: 0, updated: 0, removed: 0, skipped: 0 };
      const keyOf = (elementId: string, fieldKey: string) =>
        `${elementId}::${fieldKey}`;
      const autoByKey = buildAutoEventIndex(config.events, keyOf);
      const seenKeys = new Set<string>();
      const generatedEvents: TimelineEvent[] = [];
      const ctx: AutoBuildContext = {
        system,
        config,
        autoByKey,
        keyOf,
        seenKeys,
        generatedEvents,
        summary,
      };

      for (const element of worldbuildingElements) {
        const schema = await this.worldbuilding.getSchemaForElement(
          element.id,
          username,
          slug
        );
        if (!schema) continue;
        const dateFields = collectDateFields(schema);
        if (dateFields.length === 0) continue;

        const data = await this.worldbuilding.getWorldbuildingData(
          element.id,
          username,
          slug
        );
        if (!data) continue;

        processDateFields(element, dateFields, data, ctx);
      }

      countStaleRemovals(autoByKey, seenKeys, summary);

      const currentConfig = this.activeConfigSignal();
      if (!currentConfig) return summary;

      const manualEvents = currentConfig.events.filter(isManualEvent);

      this.saveConfig({
        ...currentConfig,
        events: [...manualEvents, ...generatedEvents],
      });

      return summary;
    } catch (err) {
      this.logger.error('Timeline', 'Auto-build from elements failed', err);
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Auto-build helpers
// ─────────────────────────────────────────────────────────────────────────

/** Collect every {@link FieldSchema} of type `date` across all tabs. */
function collectDateFields(schema: ElementTypeSchema): FieldSchema[] {
  const out: FieldSchema[] = [];
  for (const tab of schema.tabs) {
    collectDateFieldsFromFields(tab.fields, out);
  }
  return out;
}

function collectDateFieldsFromFields(
  fields: FieldSchema[],
  out: FieldSchema[]
): void {
  for (const field of fields) {
    if (field.type === 'date') {
      out.push(field);
    }
    if (field.isNested && field.nestedFields) {
      collectDateFieldsFromFields(field.nestedFields, out);
    }
  }
}

/**
 * Read a value from a nested record following a dotted key
 * (e.g. `appearance.born`). Returns `null` when any segment is missing.
 */
function readNestedValue(data: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part] ?? null;
  }
  return current;
}

function isAutoEvent(ev: TimelineEvent): boolean {
  return ev.source === 'auto' && !!ev.linkedElementId && !!ev.sourceFieldKey;
}

function isManualEvent(ev: TimelineEvent): boolean {
  return !isAutoEvent(ev);
}

function buildAutoEventIndex(
  events: readonly TimelineEvent[],
  keyOf: (elementId: string, fieldKey: string) => string
): Map<string, TimelineEvent> {
  const map = new Map<string, TimelineEvent>();
  for (const ev of events) {
    if (isAutoEvent(ev)) {
      map.set(keyOf(ev.linkedElementId!, ev.sourceFieldKey!), ev);
    }
  }
  return map;
}

function countStaleRemovals(
  autoByKey: ReadonlyMap<string, TimelineEvent>,
  seenKeys: ReadonlySet<string>,
  summary: { removed: number }
): void {
  for (const key of autoByKey.keys()) {
    if (!seenKeys.has(key)) {
      summary.removed++;
    }
  }
}

interface AutoBuildSummary {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
}

interface AutoBuildContext {
  system: TimeSystem;
  config: TimelineConfig;
  autoByKey: ReadonlyMap<string, TimelineEvent>;
  keyOf: (elementId: string, fieldKey: string) => string;
  seenKeys: Set<string>;
  generatedEvents: TimelineEvent[];
  summary: AutoBuildSummary;
}

function processDateFields(
  element: { id: string; name: string },
  dateFields: readonly FieldSchema[],
  data: Record<string, unknown>,
  ctx: AutoBuildContext
): void {
  const {
    system,
    config,
    autoByKey,
    keyOf,
    seenKeys,
    generatedEvents,
    summary,
  } = ctx;
  for (const field of dateFields) {
    const raw = readNestedValue(data, field.key);
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw !== 'string') {
      summary.skipped++;
      continue;
    }
    const point = parseTimePoint(raw, system);
    if (!point) {
      summary.skipped++;
      continue;
    }
    const normalized = normalizeTimePoint(point, system) ?? point;
    const key = keyOf(element.id, field.key);
    seenKeys.add(key);
    const existing = autoByKey.get(key);
    const title = `${element.name}: ${field.label}`;
    if (existing) {
      generatedEvents.push({ ...existing, start: normalized, title });
      summary.updated++;
    } else {
      generatedEvents.push({
        id: nanoid(),
        trackId: config.tracks[0]?.id ?? '',
        start: normalized,
        title,
        linkedElementId: element.id,
        source: 'auto' as const,
        sourceFieldKey: field.key,
      });
      summary.created++;
    }
  }
}
