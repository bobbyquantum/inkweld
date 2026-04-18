/**
 * Timeline Service
 *
 * Manages timeline configuration persistence via element metadata. Provides
 * CRUD operations for tracks, events, and eras. Mirrors {@link CanvasService}:
 * not provided at root — each {@link TimelineTabComponent} provides its own
 * instance so multiple open timelines never share state.
 */

import { inject, Injectable, signal } from '@angular/core';
import type { TimeSystem } from '@models/time-system';
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
import { nanoid } from 'nanoid';

/** Key used to store the serialized timeline config in element metadata */
export const TIMELINE_CONFIG_META_KEY = 'timelineConfig';

@Injectable()
export class TimelineService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly library = inject(TimeSystemLibraryService);

  // ─────────────────────────────────────────────────────────────────────────
  // Active timeline state
  // ─────────────────────────────────────────────────────────────────────────

  private readonly activeConfigSignal = signal<TimelineConfig | null>(null);
  readonly activeConfig = this.activeConfigSignal.asReadonly();

  // ─────────────────────────────────────────────────────────────────────────
  // Config Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load or create a timeline config for a given element. Reads from element
   * metadata if it exists; otherwise creates defaults.
   */
  loadConfig(elementId: string): TimelineConfig {
    const element = this.projectState.elements().find(e => e.id === elementId);
    const raw = element?.metadata?.[TIMELINE_CONFIG_META_KEY];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<TimelineConfig>;
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
        this.activeConfigSignal.set(config);
        return config;
      } catch {
        this.logger.warn(
          'Timeline',
          'Failed to parse timeline config from metadata; using defaults'
        );
      }
    }
    const config = createDefaultTimelineConfig(elementId);
    this.activeConfigSignal.set(config);
    return config;
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

    this.projectState.updateElementMetadata(config.elementId, {
      [TIMELINE_CONFIG_META_KEY]: JSON.stringify(toSerialize),
    });
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
    this.saveConfig({
      ...config,
      events: config.events.map(e =>
        e.id === eventId ? { ...e, ...updates, id: eventId } : e
      ),
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
    this.saveConfig({
      ...config,
      eras: config.eras.map(era =>
        era.id === eraId ? { ...era, ...updates, id: eraId } : era
      ),
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
        return rest as TimelineEvent;
      }
      return event;
    });
    if (touched) this.saveConfig({ ...config, events });
  }
}
