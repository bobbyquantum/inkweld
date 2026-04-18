/**
 * Timeline Element Configuration Models
 *
 * Defines the data structures for the Timeline element type — a horizontal
 * chronological visualization with tracks, events, and eras. Mirrors the
 * Canvas element pattern: all configuration lives inside element metadata
 * as serialized JSON, so it syncs for free via the existing elements Yjs
 * document.
 *
 * Events optionally link to any element in the project through
 * {@link TimelineEvent.linkedElementId}. Eras are rendered as coloured bands
 * spanning a range of time.
 *
 * Time values use {@link TimePoint} from `./time-system.ts`; the per-timeline
 * {@link TimelineConfig.timeSystemId} picks which calendar is active. Only
 * the three built-in systems are supported in v1; custom systems can be
 * registered in a follow-up.
 *
 * Timeline configs are stored in the project's Yjs document alongside
 * elements, relationships, and other project-level data.
 */

import { nanoid } from 'nanoid';

import type { TimePoint } from './time-system';

// ─────────────────────────────────────────────────────────────────────────────
// Version
// ─────────────────────────────────────────────────────────────────────────────

/** Schema version for migration support. Bump + add a migration when changing. */
export const TIMELINE_CONFIG_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tracks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named lane that events and eras are assigned to. Tracks control vertical
 * grouping on the rendered timeline.
 */
export interface TimelineTrack {
  id: string;
  /** User-assigned name (e.g. "Main characters", "Political events") */
  name: string;
  /** CSS colour for event pills on this track */
  color: string;
  /** Whether the track is rendered */
  visible: boolean;
  /** Z-order index. Lower rows first (top of timeline). */
  order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A point or range on the timeline. If `end` is omitted the event is an
 * instant (rendered as a single pill); otherwise it spans `[start, end]`.
 */
export interface TimelineEvent {
  id: string;
  /** Which track this event belongs to */
  trackId: string;
  /** Start time */
  start: TimePoint;
  /** Optional end time for ranged events (must be in the same system) */
  end?: TimePoint;
  /** Short human-readable title */
  title: string;
  /** Optional longer description, markdown-friendly */
  description?: string;
  /** Optional element this event references (worldbuilding element, doc, …) */
  linkedElementId?: string;
  /** Override the track colour for this one event */
  color?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eras
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A named span of time shown as a translucent coloured band behind events.
 * Unlike events, eras do not belong to a track: they span the full vertical
 * extent of the timeline.
 */
export interface TimelineEra {
  id: string;
  name: string;
  start: TimePoint;
  end: TimePoint;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineConfig {
  version: typeof TIMELINE_CONFIG_VERSION;
  /** Element ID this config belongs to (not serialized — populated on load) */
  elementId: string;
  /** ID of the {@link TimeSystem} events are expressed in */
  timeSystemId: string;
  tracks: TimelineTrack[];
  events: TimelineEvent[];
  eras: TimelineEra[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Palette used when creating new tracks / events / eras. Values are CSS
 * custom-property references so that pills adapt to the active Material
 * theme (light/dark). Variables are defined in timeline-tab.component.scss.
 */
export const TIMELINE_COLOR_PALETTE = Object.freeze([
  'var(--timeline-color-1)',
  'var(--timeline-color-2)',
  'var(--timeline-color-3)',
  'var(--timeline-color-4)',
  'var(--timeline-color-5)',
  'var(--timeline-color-6)',
]);

export function pickNextColor(index: number): string {
  return TIMELINE_COLOR_PALETTE[index % TIMELINE_COLOR_PALETTE.length];
}

export function createDefaultTrack(
  name: string,
  order: number,
  color?: string
): TimelineTrack {
  return {
    id: nanoid(),
    name,
    color: color ?? pickNextColor(order),
    visible: true,
    order,
  };
}

/**
 * Build a fresh config for a new timeline element. `timeSystemId` is left as
 * the empty string — the UI prompts the user to pick a system on first open.
 */
export function createDefaultTimelineConfig(elementId: string): TimelineConfig {
  const track = createDefaultTrack('Main track', 0);
  return {
    version: TIMELINE_CONFIG_VERSION,
    elementId,
    timeSystemId: '',
    tracks: [track],
    events: [],
    eras: [],
  };
}
