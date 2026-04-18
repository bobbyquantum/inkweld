import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  HostListener,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { TabPresenceIndicatorComponent } from '@components/tab-presence-indicator/tab-presence-indicator.component';
import {
  TimelineEraDialogComponent,
  type TimelineEraDialogData,
  type TimelineEraDialogResult,
} from '@dialogs/timeline-era-dialog/timeline-era-dialog.component';
import {
  TimelineEventDialogComponent,
  type TimelineEventDialogData,
  type TimelineEventDialogResult,
} from '@dialogs/timeline-event-dialog/timeline-event-dialog.component';
import {
  formatTimePoint,
  type TimePoint,
  timePointToAbsolute,
  type TimeSystem,
} from '@models/time-system';
import {
  pickNextColor,
  type TimelineEra,
  type TimelineEvent,
  type TimelineTrack,
} from '@models/timeline.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { PresenceService } from '@services/presence/presence.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  TIMELINE_CONFIG_META_KEY,
  TimelineService,
} from '@services/timeline/timeline.service';
import { firstValueFrom } from 'rxjs';

import {
  computeDefaultBounds,
  computeTickMarks,
  panBounds,
  tickToX,
  type TimelineBounds,
  zoomBounds,
} from './timeline-view-math';

interface EventPill {
  event: TimelineEvent;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface TickMark {
  tick: bigint;
  x: number;
  label: string;
}

interface TrackRow {
  track: TimelineTrack;
  y: number;
}

interface EraBand {
  id: string;
  name: string;
  color: string;
  x: number;
  width: number;
  /** Top of the band (inside the tracks region). */
  bandY: number;
  /** Height of the coloured band. */
  bandHeight: number;
  /** Y for the era label inside the header strip. */
  labelY: number;
  era: TimelineEra;
}

type DragKind = 'move' | 'resize-start' | 'resize-end';

@Component({
  selector: 'app-timeline-tab',
  templateUrl: './timeline-tab.component.html',
  styleUrls: ['./timeline-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TabPresenceIndicatorComponent,
  ],
  providers: [
    // Each timeline tab gets its own service so state never bleeds between
    // multiple open timelines. Mirrors CanvasTabComponent.
    TimelineService,
  ],
})
export class TimelineTabComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly timelineService = inject(TimelineService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);
  private readonly dialogs = inject(DialogGatewayService);
  private readonly presence = inject(PresenceService);

  /** Stable location key broadcast via awareness so peers see who is here. */
  protected readonly presenceLocation = computed(() => {
    const id = this.elementId();
    return id ? `timeline:${id}` : null;
  });

  protected readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('wrap');

  protected readonly availableSystems = computed<readonly TimeSystem[]>(() =>
    this.timelineService.getAvailableSystems()
  );
  protected readonly labelGutter = 110;
  protected readonly axisHeight = 28;
  protected readonly trackHeight = 52;
  /** Dedicated strip above the top axis showing era names. */
  protected readonly eraHeaderHeight = 28;
  /** Fixed top band: era header + top axis row. */
  protected readonly topBandHeight = this.eraHeaderHeight + this.axisHeight;
  /** Fixed bottom dateline row. */
  protected readonly bottomBandHeight = this.axisHeight;

  // Reactive state bound to the timeline config.
  private readonly config = this.timelineService.activeConfig;

  protected readonly events = computed(() => this.config()?.events ?? []);
  protected readonly eras = computed(() => this.config()?.eras ?? []);
  protected readonly tracks = computed(() => {
    const list = this.config()?.tracks ?? [];
    return [...list].sort((a, b) => a.order - b.order);
  });

  protected readonly activeSystemId = computed(
    () => this.config()?.timeSystemId ?? ''
  );

  private readonly activeSystem = computed<TimeSystem | null>(() => {
    const id = this.activeSystemId();
    if (!id) return null;
    return this.availableSystems().find(s => s.id === id) ?? null;
  });

  protected readonly hasActiveSystem = computed(
    () => this.activeSystem() !== null
  );

  /** Name of the committed time system, for read-only display in the toolbar. */
  protected readonly activeSystemName = computed(
    () => this.activeSystem()?.name ?? ''
  );

  /**
   * True when a timeline config exists but no time system is committed yet
   * (or the committed system is no longer installed). The timeline is locked
   * into a "pick a system" setup overlay in this state — users must commit a
   * choice before any events or eras can be authored.
   *
   * Time systems are intentionally locked per-timeline: every `TimePoint`
   * (event start/end, era start/end) stores its authoring `systemId` and the
   * render pipeline filters on it. Silently switching would hide everything
   * authored under the old system, which is a worse footgun than asking users
   * to create a second timeline for a different calendar.
   */
  protected readonly needsSystemSelection = computed(() => {
    const config = this.config();
    if (!config) return false;
    return this.activeSystem() === null;
  });

  /**
   * Transient selection in the setup overlay before the user commits. Kept
   * local (not in the config) so the lock-in only happens on explicit
   * commit.
   */
  protected readonly pendingSystemId = signal<string>('');

  /**
   * When the setup overlay becomes visible, pre-select the first installed
   * system as a convenience. Runs only while `needsSystemSelection()` is
   * true to avoid clobbering an in-progress user choice.
   */
  private readonly prefillPendingSystemEffect = effect(() => {
    if (!this.needsSystemSelection()) return;
    const current = this.pendingSystemId();
    const systems = this.availableSystems();
    if (current && systems.some(s => s.id === current)) return;
    this.pendingSystemId.set(systems[0]?.id ?? '');
  });

  // Viewport
  protected readonly viewWidth = signal(800);

  /** Current visible range in "smallest-unit" ticks. */
  protected readonly bounds = signal<TimelineBounds>({
    minTick: 0n,
    maxTick: 100n,
  });

  private pointerDrag: {
    pointerId: number;
    startX: number;
    startBounds: TimelineBounds;
  } | null = null;

  /**
   * Active era drag (move or edge-resize). While set, {@link eraDragPreview}
   * returns the in-progress start/end so the band renders at the new
   * position without mutating the stored config until pointer-up commit.
   */
  private eraDrag: {
    pointerId: number;
    eraId: string;
    kind: DragKind;
    startX: number;
    originalStartTick: bigint;
    originalEndTick: bigint;
    moved: boolean;
  } | null = null;

  /**
   * Active event drag (move or edge-resize). Same pattern as {@link eraDrag}.
   */
  private eventDrag: {
    pointerId: number;
    eventId: string;
    kind: DragKind;
    startX: number;
    originalStartTick: bigint;
    /** Absolute tick of the current end (equals start for instant events). */
    originalEndTick: bigint;
    /** Whether the source event is ranged (has an explicit `end`). */
    wasRanged: boolean;
    moved: boolean;
  } | null = null;

  protected readonly eventDragPreview = signal<{
    eventId: string;
    start: TimePoint;
    end: TimePoint | undefined;
  } | null>(null);

  protected readonly eraDragPreview = signal<{
    eraId: string;
    start: TimePoint;
    end: TimePoint;
  } | null>(null);

  /**
   * Tracks area is intentionally independent from viewport height. The middle
   * pane scrolls vertically while top and bottom timeline bands stay fixed.
   */
  protected readonly tracksCanvasHeight = computed(() =>
    Math.max(this.trackHeight, this.tracks().length * this.trackHeight)
  );

  /**
   * When a timeline loads before systems are available, defer first fit until
   * both config and active system are present.
   */
  private readonly pendingInitialFit = signal(false);

  /**
   * Current route tabId. Updated from the router paramMap; drives the
   * cold-start reload effect below.
   */
  private readonly elementId = signal<string>('');

  /**
   * On page refresh, project elements sync asynchronously after the component
   * mounts. The initial synchronous `loadConfig()` in `ngOnInit` runs before
   * elements arrive and falls back to defaults, so the timeline appears
   * empty. This effect re-runs `loadConfig()` once the element is available
   * and has persisted metadata. Mirrors the pattern in CanvasTabComponent.
   */
  private configLoadedFromMetadata = false;

  private readonly reloadOnElementsEffect = effect(() => {
    const elements = this.projectState.elements();
    const id = this.elementId();
    if (!id || elements.length === 0 || this.configLoadedFromMetadata) return;
    const element = elements.find(e => e.id === id);
    if (!element) return;
    if (element.metadata?.[TIMELINE_CONFIG_META_KEY]) {
      this.timelineService.loadConfig(id);
      this.configLoadedFromMetadata = true;
      this.pendingInitialFit.set(true);
    }
  });

  private readonly initialFitEffect = effect(() => {
    if (!this.pendingInitialFit()) return;
    const config = this.config();
    const system = this.activeSystem();
    if (!config || !system) return;
    this.fitContents();
    this.pendingInitialFit.set(false);
  });

  /** Local Y within the top fixed SVG where the axis line is rendered. */
  protected readonly topAxisY = this.topBandHeight;

  /** Local Y within the bottom fixed SVG where the axis line is rendered. */
  protected readonly bottomAxisY = 1;

  /** Backward-compat alias used by older tests. */
  protected readonly axisY = computed(() => this.topAxisY);

  protected readonly tickMarks = computed<TickMark[]>(() => {
    const system = this.activeSystem();
    if (!system) return [];
    const bounds = this.bounds();
    const width = this.viewWidth();
    const available = Math.max(1, width - this.labelGutter);
    const marks = computeTickMarks(bounds, 8);
    return marks.map(tick => ({
      tick,
      x: this.labelGutter + tickToX(tick, bounds, available),
      label: formatTickForSystem(tick, system),
    }));
  });

  protected readonly trackRows = computed<TrackRow[]>(() => {
    return this.tracks().map((track, idx) => ({
      track,
      y: idx * this.trackHeight,
    }));
  });

  protected readonly eventPills = computed<EventPill[]>(() => {
    const system = this.activeSystem();
    if (!system) return [];
    const bounds = this.bounds();
    const width = this.viewWidth();
    const available = Math.max(1, width - this.labelGutter);
    const rowByTrack = new Map(this.trackRows().map(r => [r.track.id, r]));
    const preview = this.eventDragPreview();

    return this.events().flatMap((event): EventPill[] => {
      if (event.start.systemId !== system.id) return [];
      const row = rowByTrack.get(event.trackId);
      if (!row) return [];
      const effectiveStart =
        preview?.eventId === event.id ? preview.start : event.start;
      const effectiveEnd =
        preview?.eventId === event.id ? preview.end : event.end;
      const startTick = timePointToAbsolute(effectiveStart, system);
      const startX = this.labelGutter + tickToX(startTick, bounds, available);
      const endTick =
        effectiveEnd?.systemId === system.id
          ? timePointToAbsolute(effectiveEnd, system)
          : startTick;
      const endX = this.labelGutter + tickToX(endTick, bounds, available);
      const minWidth = 80;
      const pillWidth = Math.max(minWidth, endX - startX);
      const height = this.trackHeight - 14;
      return [
        {
          event,
          x: startX,
          y: row.y + 7,
          width: pillWidth,
          height,
          color: event.color ?? row.track.color,
        },
      ];
    });
  });

  protected readonly eraBands = computed<EraBand[]>(() => {
    const system = this.activeSystem();
    if (!system) return [];
    const bounds = this.bounds();
    const width = this.viewWidth();
    const available = Math.max(1, width - this.labelGutter);
    const preview = this.eraDragPreview();
    const bandY = 0;
    const bandHeight = this.tracksCanvasHeight();
    const labelY = Math.max(0, this.eraHeaderHeight / 2);
    return this.eras().flatMap((era): EraBand[] => {
      if (era.start.systemId !== system.id) return [];
      if (era.end.systemId !== system.id) return [];
      // During an active drag, override this era's start/end with the preview.
      const effectiveStart =
        preview?.eraId === era.id ? preview.start : era.start;
      const effectiveEnd = preview?.eraId === era.id ? preview.end : era.end;
      const s = timePointToAbsolute(effectiveStart, system);
      const e = timePointToAbsolute(effectiveEnd, system);
      const x1 = this.labelGutter + tickToX(s, bounds, available);
      const x2 = this.labelGutter + tickToX(e, bounds, available);
      return [
        {
          id: era.id,
          name: era.name,
          color: era.color,
          x: Math.min(x1, x2),
          width: Math.max(1, Math.abs(x2 - x1)),
          bandY,
          bandHeight,
          labelY,
          era,
        },
      ];
    });
  });

  ngOnInit(): void {
    const elementId = this.route.snapshot.paramMap.get('tabId');
    if (!elementId) {
      this.logger.error('Timeline', 'No tabId route param');
      return;
    }
    this.elementId.set(elementId);
    this.configLoadedFromMetadata = false;
    this.timelineService.loadConfig(elementId);
    // If initial synchronous load already found persisted metadata, mark it
    // so the cold-start effect doesn't clobber user edits.
    const element = this.projectState.elements().find(e => e.id === elementId);
    if (element?.metadata?.[TIMELINE_CONFIG_META_KEY]) {
      this.configLoadedFromMetadata = true;
    }
    this.pendingInitialFit.set(true);

    // Track route param changes when the user navigates to a different timeline
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('tabId');
        if (id && id !== this.config()?.elementId) {
          this.elementId.set(id);
          this.configLoadedFromMetadata = false;
          this.timelineService.loadConfig(id);
          const el = this.projectState.elements().find(e => e.id === id);
          if (el?.metadata?.[TIMELINE_CONFIG_META_KEY]) {
            this.configLoadedFromMetadata = true;
          }
          this.pendingInitialFit.set(true);
          // Cancel any in-flight pointer interactions from the previous tab.
          this.cancelActiveDrags();
        }
      });

    // Observe size of the wrap element after view init
    queueMicrotask(() => this.measureViewport());
  }

  /** Mirror the route's elementId into awareness so other peers see us here. */
  private readonly presenceLocationEffect = effect(() => {
    this.presence.setActiveLocation(this.presenceLocation());
  });

  ngOnDestroy(): void {
    this.cancelActiveDrags();
    // Clear our presence so we vanish from other peers' indicators.
    this.presence.setActiveLocation(null);
  }

  /** Cancel any in-flight pointer interactions and clear preview state. */
  private cancelActiveDrags(): void {
    this.pointerDrag = null;
    this.eraDrag = null;
    this.eventDrag = null;
    this.eraDragPreview.set(null);
    this.eventDragPreview.set(null);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.measureViewport();
  }

  private measureViewport(): void {
    const wrap = this.wrapRef()?.nativeElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width > 0) this.viewWidth.set(Math.floor(rect.width));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Toolbar actions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Commit the user's selection from the setup overlay. After commit, the
   * timeline is locked to this system: every subsequent event/era is
   * authored under it, and changing system would silently hide them all.
   * Users who want a different calendar should create a new timeline.
   */
  protected onCommitTimeSystem(): void {
    const id = this.pendingSystemId();
    if (!id) return;
    if (!this.availableSystems().some(s => s.id === id)) return;
    this.timelineService.setTimeSystem(id);
    // The canvas-wrap is only rendered once a system is committed, so its
    // dimensions aren't available until the next microtask. Measure before
    // fitting so tickmarks and pills don't lay out against a stale width.
    queueMicrotask(() => {
      this.measureViewport();
      this.fitContents();
    });
  }

  protected onPendingSystemChange(id: string): void {
    this.pendingSystemId.set(id);
  }

  protected async onAddTrack(): Promise<void> {
    const fallbackName = `Track ${this.tracks().length + 1}`;
    const value = await this.dialogs.openRenameDialog({
      currentName: fallbackName,
      title: 'Add new track',
    });
    if (value === null || value === undefined) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    this.timelineService.addTrack(trimmed);
  }

  protected async onTrackLabelClick(track: TimelineTrack): Promise<void> {
    const value = await this.dialogs.openRenameDialog({
      currentName: track.name,
      title: 'Rename track',
    });
    if (value === null || value === undefined) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === track.name) return;
    this.timelineService.updateTrack(track.id, { name: trimmed });
  }

  protected async onAddEvent(): Promise<void> {
    const config = this.config();
    const system = this.activeSystem();
    if (!config || !system) return;
    const data: TimelineEventDialogData = {
      event: null,
      tracks: this.tracks(),
      system,
      defaultTrackId: this.tracks()[0]?.id,
    };
    const ref = this.dialog.open<
      TimelineEventDialogComponent,
      TimelineEventDialogData,
      TimelineEventDialogResult
    >(TimelineEventDialogComponent, { data });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    if (result.kind === 'save') {
      // Omit id: the service assigns one.
      const { id: _id, ...rest } = result.event;
      this.timelineService.addEvent(rest);
      this.fitContents();
    }
  }

  protected async onEventClick(event: TimelineEvent): Promise<void> {
    const config = this.config();
    const system = this.activeSystem();
    if (!config || !system) return;
    const data: TimelineEventDialogData = {
      event,
      tracks: this.tracks(),
      system,
    };
    const ref = this.dialog.open<
      TimelineEventDialogComponent,
      TimelineEventDialogData,
      TimelineEventDialogResult
    >(TimelineEventDialogComponent, { data });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    if (result.kind === 'delete') {
      this.timelineService.removeEvent(result.eventId);
    } else {
      this.timelineService.updateEvent(event.id, {
        title: result.event.title,
        trackId: result.event.trackId,
        start: result.event.start,
        end: result.event.end,
        description: result.event.description,
      });
    }
  }

  protected async onAddEra(): Promise<void> {
    const system = this.activeSystem();
    if (!system) return;
    const bounds = this.bounds();
    const firstTick = bounds.minTick + (bounds.maxTick - bounds.minTick) / 4n;
    const lastTick =
      bounds.minTick + ((bounds.maxTick - bounds.minTick) * 3n) / 4n;
    const data: TimelineEraDialogData = {
      era: null,
      system,
      defaultStart: tickToTimePoint(firstTick, system),
      defaultEnd: tickToTimePoint(lastTick, system),
      defaultColor: pickNextColor(this.eras().length),
    };
    const ref = this.dialog.open<
      TimelineEraDialogComponent,
      TimelineEraDialogData,
      TimelineEraDialogResult
    >(TimelineEraDialogComponent, { data });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.kind !== 'save') return;
    const { id: _id, ...rest } = result.era;
    this.timelineService.addEra(rest);
    this.fitContents();
  }

  protected async onEraClick(era: TimelineEra): Promise<void> {
    const system = this.activeSystem();
    if (!system) return;
    const data: TimelineEraDialogData = { era, system };
    const ref = this.dialog.open<
      TimelineEraDialogComponent,
      TimelineEraDialogData,
      TimelineEraDialogResult
    >(TimelineEraDialogComponent, { data });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    if (result.kind === 'delete') {
      this.timelineService.removeEra(result.eraId);
    } else {
      this.timelineService.updateEra(era.id, {
        name: result.era.name,
        start: result.era.start,
        end: result.era.end,
        color: result.era.color,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Era drag (move or edge-resize)
  // ─────────────────────────────────────────────────────────────────────────

  protected onEraPointerDown(
    event: PointerEvent,
    era: TimelineEra,
    kind: DragKind
  ): void {
    if (event.button !== 0) return;
    const system = this.activeSystem();
    if (!system) return;
    if (era.start.systemId !== system.id || era.end.systemId !== system.id) {
      return;
    }
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.eraDrag = {
      pointerId: event.pointerId,
      eraId: era.id,
      kind,
      startX: event.clientX,
      originalStartTick: timePointToAbsolute(era.start, system),
      originalEndTick: timePointToAbsolute(era.end, system),
      moved: false,
    };
  }

  protected onEraPointerMove(event: PointerEvent): void {
    const drag = this.eraDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const system = this.activeSystem();
    if (!system) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) >= 2) drag.moved = true;
    const available = Math.max(1, this.viewWidth() - this.labelGutter);
    const bounds = this.bounds();
    const range = bounds.maxTick - bounds.minTick;
    // Convert pixel delta → tick delta (BigInt). Round to nearest tick.
    const tickDelta = BigInt(Math.round((dx / available) * Number(range)));

    let newStart = drag.originalStartTick;
    let newEnd = drag.originalEndTick;
    switch (drag.kind) {
      case 'move':
        newStart = drag.originalStartTick + tickDelta;
        newEnd = drag.originalEndTick + tickDelta;
        break;
      case 'resize-start':
        newStart = drag.originalStartTick + tickDelta;
        if (newStart > drag.originalEndTick) newStart = drag.originalEndTick;
        break;
      case 'resize-end':
        newEnd = drag.originalEndTick + tickDelta;
        if (newEnd < drag.originalStartTick) newEnd = drag.originalStartTick;
        break;
    }

    this.eraDragPreview.set({
      eraId: drag.eraId,
      start: tickToTimePoint(newStart, system),
      end: tickToTimePoint(newEnd, system),
    });
  }

  protected onEraPointerUp(event: PointerEvent, era: TimelineEra): void {
    const drag = this.eraDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const preview = this.eraDragPreview();
    this.eraDrag = null;
    this.eraDragPreview.set(null);
    if (!drag.moved) {
      // Treat as a click → open edit dialog.
      void this.onEraClick(era);
      return;
    }
    if (preview?.eraId === era.id) {
      this.timelineService.updateEra(era.id, {
        start: preview.start,
        end: preview.end,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event drag (move or edge-resize)
  // ─────────────────────────────────────────────────────────────────────────

  protected onEventPointerDown(
    event: PointerEvent,
    ev: TimelineEvent,
    kind: DragKind
  ): void {
    if (event.button !== 0) return;
    const system = this.activeSystem();
    if (!system) return;
    if (ev.start.systemId !== system.id) return;
    if (ev.end && ev.end.systemId !== system.id) return;
    // Resize handles only make sense for ranged events.
    if (kind !== 'move' && !ev.end) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const startTick = timePointToAbsolute(ev.start, system);
    const endTick = ev.end ? timePointToAbsolute(ev.end, system) : startTick;
    this.eventDrag = {
      pointerId: event.pointerId,
      eventId: ev.id,
      kind,
      startX: event.clientX,
      originalStartTick: startTick,
      originalEndTick: endTick,
      wasRanged: ev.end !== undefined,
      moved: false,
    };
  }

  protected onEventPointerMove(event: PointerEvent): void {
    const drag = this.eventDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const system = this.activeSystem();
    if (!system) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) >= 2) drag.moved = true;
    const available = Math.max(1, this.viewWidth() - this.labelGutter);
    const bounds = this.bounds();
    const range = bounds.maxTick - bounds.minTick;
    const tickDelta = BigInt(Math.round((dx / available) * Number(range)));

    let newStart = drag.originalStartTick;
    let newEnd = drag.originalEndTick;
    switch (drag.kind) {
      case 'move':
        newStart = drag.originalStartTick + tickDelta;
        newEnd = drag.originalEndTick + tickDelta;
        break;
      case 'resize-start':
        newStart = drag.originalStartTick + tickDelta;
        if (newStart > drag.originalEndTick) newStart = drag.originalEndTick;
        break;
      case 'resize-end':
        newEnd = drag.originalEndTick + tickDelta;
        if (newEnd < drag.originalStartTick) newEnd = drag.originalStartTick;
        break;
    }

    this.eventDragPreview.set({
      eventId: drag.eventId,
      start: tickToTimePoint(newStart, system),
      end: drag.wasRanged ? tickToTimePoint(newEnd, system) : undefined,
    });
  }

  protected onEventPointerUp(event: PointerEvent, ev: TimelineEvent): void {
    const drag = this.eventDrag;
    if (drag?.pointerId !== event.pointerId) return;
    const preview = this.eventDragPreview();
    this.eventDrag = null;
    this.eventDragPreview.set(null);
    if (!drag.moved) {
      // Treat as a click → open edit dialog.
      void this.onEventClick(ev);
      return;
    }
    if (preview?.eventId === ev.id) {
      this.timelineService.updateEvent(ev.id, {
        start: preview.start,
        end: preview.end,
      });
    }
  }

  protected onZoom(factor: number): void {
    this.bounds.update(b => zoomBounds(b, factor, 0.5));
  }

  protected onFit(): void {
    this.fitContents();
  }

  private fitContents(): void {
    const config = this.config();
    if (!config) return;
    const system = this.activeSystem();
    if (!system) return;
    this.bounds.set(computeDefaultBounds(system, config.events, config.eras));
  }

  protected onOpenTimeSystemSettings(): void {
    // Navigate to the project Settings tab's Time Systems section.
    // Route pattern mirrors how other settings sections are addressed:
    // /project/:username/:slug/settings. The Settings tab reads a query
    // param `section` to pre-select the Time Systems pane.
    const params = this.route.snapshot.paramMap;
    const username = params.get('username');
    const slug = params.get('slug');
    if (!username || !slug) return;
    void this.router.navigate(['/project', username, slug, 'settings'], {
      queryParams: { section: 'time-systems' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pointer / wheel interaction
  // ─────────────────────────────────────────────────────────────────────────

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const width = this.viewWidth() - this.labelGutter;
    if (width <= 0) return;
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const pixelX = event.clientX - rect.left - this.labelGutter;
    const pivot = Math.min(1, Math.max(0, pixelX / width));
    const factor = event.deltaY < 0 ? 0.9 : 1.1;
    this.bounds.update(b => zoomBounds(b, factor, pivot));
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (target?.closest('[data-testid^="timeline-event-"]')) {
      return; // let click on pill handle it
    }
    if (target?.closest('[data-testid^="timeline-era-"]')) {
      return; // era body/handles drive their own drag
    }
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.pointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startBounds: this.bounds(),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.pointerDrag?.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - this.pointerDrag.startX;
    const available = Math.max(1, this.viewWidth() - this.labelGutter);
    this.bounds.set(panBounds(this.pointerDrag.startBounds, dx, available));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.pointerDrag?.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
  }
}

function tickToTimePoint(tick: bigint, system: TimeSystem): TimePoint {
  // Convert an absolute tick (smallest-unit count) back to unit strings,
  // most-significant first. Mirrors the inverse of `timePointToAbsolute`.
  //
  // For negative ticks, normalise with borrow so lower-level units stay
  // within [0, subdivision-1] and only the top unit carries the sign.
  const weights: bigint[] = [];
  const n = system.unitLabels.length;
  let acc = 1n;
  weights[n - 1] = acc;
  for (let i = n - 2; i >= 0; i--) {
    acc *= BigInt(system.subdivisions[i]);
    weights[i] = acc;
  }
  const units: string[] = Array.from({ length: n }, () => '0');
  let remainder = tick;
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    if (i === n - 1) {
      units[i] = remainder.toString();
    } else {
      let value = remainder / w;
      let leftover = remainder - value * w;
      // Borrow: if the leftover is negative, decrement this unit and
      // make the leftover positive so lower units stay in-range.
      if (leftover < 0n) {
        value -= 1n;
        leftover += w;
      }
      units[i] = value.toString();
      remainder = leftover;
    }
  }
  return { systemId: system.id, units };
}

function formatTickForSystem(tick: bigint, system: TimeSystem): string {
  const tp = tickToTimePoint(tick, system);
  try {
    return formatTimePoint(tp, system);
  } catch {
    // formatTimePoint can throw for edge-case unit values; fall back to raw tick
    return tick.toString();
  }
}

export { compareTimePoints } from '@models/time-system';
