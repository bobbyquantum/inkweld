import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GREGORIAN_SYSTEM,
  RELATIVE_YEARS_SYSTEM,
  TIME_SYSTEM_TEMPLATES,
  type TimeSystem,
} from '../../models/time-system';
import {
  createDefaultTimelineConfig,
  type TimelineEra,
  type TimelineEvent,
} from '../../models/timeline.model';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { TimeSystemLibraryService } from './time-system-library.service';
import { TIMELINE_CONFIG_META_KEY, TimelineService } from './timeline.service';

function makeTimelineElement(overrides: Partial<Element> = {}): Element {
  return {
    id: 'timeline-1',
    name: 'Test Timeline',
    type: ElementType.Timeline,
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
    ...overrides,
  };
}

describe('TimelineService', () => {
  let service: TimelineService;
  const mockElements = signal<Element[]>([]);

  const mockProjectState = {
    elements: mockElements,
    updateElementMetadata: vi.fn(),
  };

  const installedSystems = signal<TimeSystem[]>([
    GREGORIAN_SYSTEM,
    { ...RELATIVE_YEARS_SYSTEM },
    ...TIME_SYSTEM_TEMPLATES.filter(
      t => t.id !== GREGORIAN_SYSTEM.id && t.id !== RELATIVE_YEARS_SYSTEM.id
    ).slice(0, 1),
  ]);

  const mockLibrary = {
    systems: installedSystems,
    templates: TIME_SYSTEM_TEMPLATES,
    findSystem: (id: string) => installedSystems().find(s => s.id === id),
    resolveSystem: (id: string | undefined) =>
      id ? (installedSystems().find(s => s.id === id) ?? null) : null,
  };

  const mockLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TimelineService,
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: TimeSystemLibraryService, useValue: mockLibrary },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });
    service = TestBed.inject(TimelineService);
    mockElements.set([]);
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────
  // loadConfig / saveConfig
  // ───────────────────────────────────────────────────────────────────────

  describe('loadConfig', () => {
    it('returns defaults for an element with no metadata', () => {
      mockElements.set([makeTimelineElement()]);
      const config = service.loadConfig('timeline-1');
      expect(config.elementId).toBe('timeline-1');
      // New projects start with no system selected — UI prompts the user.
      expect(config.timeSystemId).toBe('');
      expect(config.tracks).toHaveLength(1);
      expect(config.events).toEqual([]);
      expect(config.eras).toEqual([]);
    });

    it('restores persisted config from metadata', () => {
      const stored = createDefaultTimelineConfig('timeline-1');
      stored.timeSystemId = RELATIVE_YEARS_SYSTEM.id;
      stored.events = [
        {
          id: 'e1',
          trackId: stored.tracks[0].id,
          title: 'Founding',
          start: { systemId: stored.timeSystemId, units: ['0'] },
        },
      ];
      mockElements.set([
        makeTimelineElement({
          metadata: {
            [TIMELINE_CONFIG_META_KEY]: JSON.stringify({
              version: stored.version,
              timeSystemId: stored.timeSystemId,
              tracks: stored.tracks,
              events: stored.events,
              eras: stored.eras,
            }),
          },
        }),
      ]);

      const config = service.loadConfig('timeline-1');
      expect(config.timeSystemId).toBe(RELATIVE_YEARS_SYSTEM.id);
      expect(config.events).toHaveLength(1);
      expect(config.events[0].title).toBe('Founding');
    });

    it('falls back to defaults on malformed JSON', () => {
      mockElements.set([
        makeTimelineElement({
          metadata: { [TIMELINE_CONFIG_META_KEY]: '{not valid' },
        }),
      ]);
      const config = service.loadConfig('timeline-1');
      expect(config.tracks).toHaveLength(1);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('repairs missing tracks/events/eras arrays', () => {
      mockElements.set([
        makeTimelineElement({
          metadata: {
            [TIMELINE_CONFIG_META_KEY]: JSON.stringify({
              timeSystemId: 'gregorian',
            }),
          },
        }),
      ]);
      const config = service.loadConfig('timeline-1');
      expect(config.tracks.length).toBeGreaterThan(0);
      expect(config.events).toEqual([]);
      expect(config.eras).toEqual([]);
    });
  });

  describe('saveConfig', () => {
    it('serializes to metadata without the elementId', () => {
      mockElements.set([makeTimelineElement()]);
      const config = service.loadConfig('timeline-1');
      service.saveConfig({ ...config, timeSystemId: RELATIVE_YEARS_SYSTEM.id });

      expect(mockProjectState.updateElementMetadata).toHaveBeenCalledWith(
        'timeline-1',
        expect.objectContaining({
          [TIMELINE_CONFIG_META_KEY]: expect.any(String),
        })
      );
      const call = mockProjectState.updateElementMetadata.mock.calls.at(-1);
      expect(call).toBeDefined();
      const stored = JSON.parse(
        (call?.[1] as Record<string, string>)[TIMELINE_CONFIG_META_KEY]
      );
      expect(stored.elementId).toBeUndefined();
      expect(stored.timeSystemId).toBe(RELATIVE_YEARS_SYSTEM.id);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Remote sync (regression: timeline edits from other users appear live)
  // ───────────────────────────────────────────────────────────────────────

  describe('remote sync', () => {
    it('updates activeConfig when the bound element metadata changes remotely', () => {
      const baseline = createDefaultTimelineConfig('timeline-1');
      baseline.timeSystemId = RELATIVE_YEARS_SYSTEM.id;
      mockElements.set([
        makeTimelineElement({
          metadata: {
            [TIMELINE_CONFIG_META_KEY]: JSON.stringify({
              version: baseline.version,
              timeSystemId: baseline.timeSystemId,
              tracks: baseline.tracks,
              events: [],
              eras: [],
            }),
          },
        }),
      ]);
      service.loadConfig('timeline-1');
      expect(service.activeConfig()?.events).toHaveLength(0);

      const remoteEvent: TimelineEvent = {
        id: 'ev-remote',
        trackId: baseline.tracks[0].id,
        title: 'Remote Event',
        start: { systemId: baseline.timeSystemId, units: ['5'] },
      };
      const remoteEra: TimelineEra = {
        id: 'era-remote',
        name: 'Remote Era',
        color: '#abcdef',
        start: { systemId: baseline.timeSystemId, units: ['0'] },
        end: { systemId: baseline.timeSystemId, units: ['10'] },
      };

      mockElements.set([
        makeTimelineElement({
          metadata: {
            [TIMELINE_CONFIG_META_KEY]: JSON.stringify({
              version: baseline.version,
              timeSystemId: baseline.timeSystemId,
              tracks: baseline.tracks,
              events: [remoteEvent],
              eras: [remoteEra],
            }),
          },
        }),
      ]);
      TestBed.flushEffects();

      const active = service.activeConfig()!;
      expect(active.events).toHaveLength(1);
      expect(active.events[0].title).toBe('Remote Event');
      expect(active.eras).toHaveLength(1);
      expect(active.eras[0].name).toBe('Remote Era');
    });

    it('skips re-parsing on echoes of its own writes', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      const warnBefore = mockLogger.warn.mock.calls.length;

      service.setTimeSystem(RELATIVE_YEARS_SYSTEM.id);
      const call = mockProjectState.updateElementMetadata.mock.calls.at(-1) as [
        string,
        Record<string, string>,
      ];
      const serialized = call[1][TIMELINE_CONFIG_META_KEY];
      const afterSave = service.activeConfig();

      mockElements.set([
        makeTimelineElement({
          metadata: { [TIMELINE_CONFIG_META_KEY]: serialized },
        }),
      ]);
      TestBed.flushEffects();

      expect(service.activeConfig()).toBe(afterSave);
      expect(mockLogger.warn.mock.calls.length).toBe(warnBefore);
    });

    it('rebinds when loadConfig is called with a different elementId', () => {
      mockElements.set([
        makeTimelineElement({ id: 'timeline-1', name: 'One' }),
        makeTimelineElement({ id: 'timeline-2', name: 'Two' }),
      ]);
      service.loadConfig('timeline-1');
      service.loadConfig('timeline-2');
      expect(service.activeConfig()?.elementId).toBe('timeline-2');

      // A remote edit to timeline-1 must not affect the now-bound timeline-2.
      const firstConfig = createDefaultTimelineConfig('timeline-1');
      mockElements.set([
        makeTimelineElement({
          id: 'timeline-1',
          metadata: {
            [TIMELINE_CONFIG_META_KEY]: JSON.stringify({
              version: firstConfig.version,
              timeSystemId: 'relative-years',
              tracks: firstConfig.tracks,
              events: [],
              eras: [],
            }),
          },
        }),
        makeTimelineElement({ id: 'timeline-2', name: 'Two' }),
      ]);
      TestBed.flushEffects();

      expect(service.activeConfig()?.elementId).toBe('timeline-2');
      expect(service.activeConfig()?.timeSystemId).not.toBe('relative-years');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Time system
  // ───────────────────────────────────────────────────────────────────────

  describe('time systems', () => {
    it('returns installed systems from the library', () => {
      const systems = service.getAvailableSystems();
      expect(systems.map(s => s.id)).toContain('gregorian');
      expect(systems.map(s => s.id)).toContain('relative-years');
    });

    it('setTimeSystem updates config', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      service.setTimeSystem('relative-years');
      expect(service.activeConfig()?.timeSystemId).toBe('relative-years');
    });

    it('setTimeSystem ignores unknown ids', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      service.setTimeSystem('gregorian');
      service.setTimeSystem('not-a-real-system');
      expect(service.activeConfig()?.timeSystemId).toBe('gregorian');
    });

    it('getActiveSystem returns null when no system selected', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      expect(service.getActiveSystem()).toBeNull();
    });

    it('getActiveSystem returns the selected system when installed', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      service.setTimeSystem('gregorian');
      expect(service.getActiveSystem()?.id).toBe('gregorian');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Tracks
  // ───────────────────────────────────────────────────────────────────────

  describe('tracks', () => {
    beforeEach(() => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
    });

    it('adds a track with incremented order', () => {
      const id = service.addTrack('B');
      const tracks = service.activeConfig()?.tracks ?? [];
      expect(tracks).toHaveLength(2);
      expect(tracks.find(t => t.id === id)?.order).toBe(1);
    });

    it('removeTrack refuses to remove the last track', () => {
      service.removeTrack(service.activeConfig()!.tracks[0].id);
      expect(service.activeConfig()?.tracks).toHaveLength(1);
    });

    it('removeTrack drops events on the removed track', () => {
      const origTrack = service.activeConfig()!.tracks[0].id;
      const otherTrack = service.addTrack();
      service.addEvent({
        trackId: origTrack,
        title: 'A',
        start: { systemId: 'gregorian', units: ['1', '1', '1'] },
      });
      service.addEvent({
        trackId: otherTrack,
        title: 'B',
        start: { systemId: 'gregorian', units: ['2', '1', '1'] },
      });
      service.removeTrack(origTrack);
      const events = service.activeConfig()?.events ?? [];
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('B');
    });

    it('updateTrack preserves id', () => {
      const id = service.activeConfig()!.tracks[0].id;
      service.updateTrack(id, { name: 'Renamed', id: 'ignored' });
      expect(service.activeConfig()?.tracks[0].id).toBe(id);
      expect(service.activeConfig()?.tracks[0].name).toBe('Renamed');
    });

    it('getSortedTracks returns ascending by order', () => {
      service.addTrack('B');
      service.addTrack('C');
      const sorted = service.getSortedTracks();
      expect(sorted.map(t => t.order)).toEqual([0, 1, 2]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Events
  // ───────────────────────────────────────────────────────────────────────

  describe('events', () => {
    beforeEach(() => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
    });

    const base = (): Omit<TimelineEvent, 'id'> => ({
      trackId: service.activeConfig()!.tracks[0].id,
      title: 'Founding',
      start: { systemId: 'gregorian', units: ['1', '1', '1'] },
    });

    it('addEvent returns an id and appends', () => {
      const id = service.addEvent(base());
      expect(id).toMatch(/^.+$/);
      expect(service.activeConfig()?.events).toHaveLength(1);
      expect(service.activeConfig()?.events[0].id).toBe(id);
    });

    it('updateEvent merges fields', () => {
      const id = service.addEvent(base());
      service.updateEvent(id, { title: 'Updated', description: 'note' });
      const event = service.activeConfig()?.events.find(e => e.id === id);
      expect(event?.title).toBe('Updated');
      expect(event?.description).toBe('note');
    });

    it('removeEvent drops it', () => {
      const id = service.addEvent(base());
      service.removeEvent(id);
      expect(service.activeConfig()?.events).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Eras
  // ───────────────────────────────────────────────────────────────────────

  describe('eras', () => {
    beforeEach(() => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
    });

    const era = (): Omit<TimelineEra, 'id'> => ({
      name: 'First Age',
      start: { systemId: 'gregorian', units: ['1', '1', '1'] },
      end: { systemId: 'gregorian', units: ['100', '1', '1'] },
      color: '#abcdef',
    });

    it('addEra appends', () => {
      const id = service.addEra(era());
      expect(service.activeConfig()?.eras).toHaveLength(1);
      expect(service.activeConfig()?.eras[0].id).toBe(id);
    });

    it('updateEra merges', () => {
      const id = service.addEra(era());
      service.updateEra(id, { name: 'Golden Age' });
      expect(service.activeConfig()?.eras[0].name).toBe('Golden Age');
    });

    it('removeEra drops it', () => {
      const id = service.addEra(era());
      service.removeEra(id);
      expect(service.activeConfig()?.eras).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Orphan cleanup
  // ───────────────────────────────────────────────────────────────────────

  describe('clearLinksToElement', () => {
    it('removes linkedElementId from matching events', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      const trackId = service.activeConfig()!.tracks[0].id;
      const id = service.addEvent({
        trackId,
        title: 'Linked',
        start: { systemId: 'gregorian', units: ['1', '1', '1'] },
        linkedElementId: 'character-42',
      });
      service.clearLinksToElement('character-42');
      expect(
        service.activeConfig()?.events.find(e => e.id === id)?.linkedElementId
      ).toBeUndefined();
    });

    it('is a no-op when no events match', () => {
      mockElements.set([makeTimelineElement()]);
      service.loadConfig('timeline-1');
      const writesBefore =
        mockProjectState.updateElementMetadata.mock.calls.length;
      service.clearLinksToElement('does-not-exist');
      expect(mockProjectState.updateElementMetadata.mock.calls.length).toBe(
        writesBefore
      );
    });
  });
});
