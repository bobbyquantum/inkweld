import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  HostListener,
  inject,
  NgZone,
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
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
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
  absoluteToTimePoint,
  isValidTimePointFor,
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
  assignLabelLanes,
  computeDefaultBounds,
  computeTimeSystemTickMarks,
  panBounds,
  tickToX,
  type TimelineBounds,
  zoomBounds,
} from './timeline-view-math';

interface EventPill {
  event: TimelineEvent;
  /** True when the event has no `end` (rendered as diamond + stalk). */
  isInstant: boolean;
  /** Diamond/rect colour. */
  color: string;
  // ── Instant-event geometry ─────────────────────────────────────────
  /** Centre X of the diamond / vertical stalk (instants only). */
  cx?: number;
  /** Y of the axis-line within the track row (instants only). */
  axisY?: number;
  /** Y of the diamond's vertical centre (instants only). */
  diamondCY?: number;
  /** Y baseline of the label text (instants only). */
  labelY?: number;
  /** Polygon points string for the diamond (instants only). */
  diamondPoints?: string;
  /** Hit area for the diamond (instants only). */
  hitX?: number;
  hitY?: number;
  hitW?: number;
  hitH?: number;
  // ── Ranged-event geometry ──────────────────────────────────────────
  /** Left edge of the rectangle (ranged only). */
  x?: number;
  /** Top edge of the rectangle (ranged only). */
  y?: number;
  /** Rectangle width clamped to the visible viewport (ranged only). */
  width?: number;
  /** Rectangle height (ranged only). */
  height?: number;
  /** Label baseline Y inside the rectangle (ranged only). */
  rangedLabelY?: number;
  /** True if the title fits inside `width` (used to decide tooltip). */
  titleFits?: boolean;
}

interface TickMark {
  tick: bigint;
  x: number;
  label: string;
  level: number;
  kind: 'major' | 'minor';
}

interface TrackRow {
  track: TimelineTrack;
  y: number;
  height: number;
  laneCount: number;
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
    DocumentBreadcrumbsComponent,
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
  private readonly ngZone = inject(NgZone);

  /** Stable location key broadcast via awareness so peers see who is here. */
  protected readonly presenceLocation = computed(() => {
    const id = this.elementId();
    return id ? `timeline:${id}` : null;
  });

  protected readonly wrapRef = viewChild<ElementRef<HTMLDivElement>>('wrap');

  private readonly measureWrapEffect = effect(onCleanup => {
    const wrap = this.wrapRef()?.nativeElement;
    if (!wrap) return;

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        this.ngZone.run(() => this.measureViewport());
      });
      observer.observe(wrap);
      onCleanup(() => observer.disconnect());
    }

    this.scheduleMeasureViewport();
  });

  protected readonly availableSystems = computed<readonly TimeSystem[]>(() =>
    this.timelineService.getAvailableSystems()
  );
  protected readonly labelGutter = 110;
  protected readonly axisHeight = 28;
  /** Fixed event-area height per track (where diamonds + ranged rectangles sit). */
  protected readonly eventAreaHeight = 38;
  /** Vertical height per stacked label lane above the event area. */
  protected readonly labelLaneHeight = 18;
  /** Half-width of an instant-event diamond, in pixels. */
  protected readonly diamondHalf = 7;
  /** Approximate per-character width used for label-overlap calculation. */
  private readonly labelCharWidth = 6.5;
  /** Minimum gap (px) required between adjacent labels in the same lane. */
  private readonly labelMinGap = 8;
  /** Vertical padding below event area, before the divider line. */
  private readonly eventAreaPadding = 4;
  /** @deprecated retained for backward-compat with older tests. */
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
   * Per-track label lane counts. Computed from the instant events' X
   * positions so each track row can grow tall enough to host its label
   * stack. Ranged events do not contribute to the lane count (their labels
   * sit inside the rectangle).
   */
  private readonly trackLaneCounts = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    const system = this.activeSystem();
    if (!system) return map;
    const bounds = this.bounds();
    const width = this.viewWidth();
    const available = Math.max(1, width - this.labelGutter);
    const preview = this.eventDragPreview();
    // Group instant events per track, then assign lanes per group.
    const byTrack = new Map<string, { x: number; labelWidth: number }[]>();
    for (const event of this.events()) {
      const isPreview = preview?.eventId === event.id;
      const effectiveStart = isPreview ? preview.start : event.start;
      const effectiveEnd = isPreview ? preview.end : event.end;
      // During an active drag, the preview's start/end may temporarily fall
      // outside the calendar's per-unit bounds (e.g. month=15). Skip the
      // validity guard for the dragged event so it doesn't vanish from the
      // canvas mid-gesture; the commit on pointerup will re-clamp via
      // updateEvent. For non-dragged events, drop invalid points as before.
      if (!isPreview && !isValidTimePointFor(effectiveStart, system)) continue;
      // Only instant events (no end) contribute to label lanes.
      if (effectiveEnd) continue;
      let startTick: bigint;
      try {
        startTick = timePointToAbsolute(effectiveStart, system);
      } catch {
        // Preview may produce a TimePoint that fails the round-trip; bail
        // for lane-count purposes (the event will still render via the
        // pill pass below using fallback geometry).
        continue;
      }
      const cx = this.labelGutter + tickToX(startTick, bounds, available);
      const labelWidth = Math.max(
        24,
        event.title.length * this.labelCharWidth + 8
      );
      let arr = byTrack.get(event.trackId);
      if (!arr) {
        arr = [];
        byTrack.set(event.trackId, arr);
      }
      arr.push({ x: cx, labelWidth });
    }
    for (const [trackId, items] of byTrack) {
      const { laneCount } = assignLabelLanes(items, this.labelMinGap);
      map.set(trackId, laneCount);
    }
    return map;
  });

  /** Height of a single track row, given its label lane count. */
  private trackRowHeight(laneCount: number): number {
    return laneCount * this.labelLaneHeight + this.eventAreaHeight;
  }

  protected readonly trackRows = computed<TrackRow[]>(() => {
    const lanes = this.trackLaneCounts();
    const rows: TrackRow[] = [];
    let y = 0;
    for (const track of this.tracks()) {
      const laneCount = lanes.get(track.id) ?? 0;
      const height = this.trackRowHeight(laneCount);
      rows.push({ track, y, height, laneCount });
      y += height;
    }
    return rows;
  });

  /**
   * Tracks area is intentionally independent from viewport height. The middle
   * pane scrolls vertically while top and bottom timeline bands stay fixed.
   */
  protected readonly tracksCanvasHeight = computed(() => {
    const rows = this.trackRows();
    if (rows.length === 0) return this.eventAreaHeight;
    const last = rows[rows.length - 1];
    return last.y + last.height;
  });

  /**
   * When a timeline loads before systems are available, defer first fit until
   * both config and active system are present.
   */
  private readonly pendingInitialFit = signal(false);

  /**
   * Current route tabId. Updated from the router paramMap; drives the
   * cold-start reload effect below.
   */
  protected readonly elementId = signal<string>('');

  /**
   * On page refresh, project elements sync asynchronously after the component
   * mounts. The initial synchronous `loadConfig()` in `ngOnInit` runs before
   * elements arrive and falls back to defaults. The TimelineService is
   * element-bound and re-parses metadata reactively whenever the elements
   * signal emits (local edits OR remote sync), so we only need to trigger an
   * initial-fit once the active config actually populates from persisted
   * metadata.
   */
  private initialFitDone = false;

  private readonly reloadOnElementsEffect = effect(() => {
    const id = this.elementId();
    if (!id) return;
    const element = this.projectState.elements().find(e => e.id === id);
    if (!element) return;
    if (!this.initialFitDone && element.metadata?.[TIMELINE_CONFIG_META_KEY]) {
      this.initialFitDone = true;
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
    const marks = computeTimeSystemTickMarks(bounds, available, system);
    return marks.map(mark => ({
      tick: mark.tick,
      x: this.labelGutter + tickToX(mark.tick, bounds, available),
      label: mark.label,
      level: mark.level,
      kind: mark.kind,
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

    // First pass: bucket instant events per track so we can re-run the
    // lane assignment and recover each event's lane index. Doing this
    // here (instead of caching in `trackLaneCounts`) keeps the lanes
    // signal cheap (just lane *counts*, no per-event index map).
    const instantsByTrack = new Map<
      string,
      { eventId: string; x: number; labelWidth: number }[]
    >();
    for (const event of this.events()) {
      const isPreview = preview?.eventId === event.id;
      const effectiveStart = isPreview ? preview.start : event.start;
      const effectiveEnd = isPreview ? preview.end : event.end;
      if (!isPreview && !isValidTimePointFor(effectiveStart, system)) continue;
      if (effectiveEnd) continue;
      if (!rowByTrack.has(event.trackId)) continue;
      let startTick: bigint;
      try {
        startTick = timePointToAbsolute(effectiveStart, system);
      } catch {
        continue;
      }
      const cx = this.labelGutter + tickToX(startTick, bounds, available);
      const labelWidth = Math.max(
        24,
        event.title.length * this.labelCharWidth + 8
      );
      let arr = instantsByTrack.get(event.trackId);
      if (!arr) {
        arr = [];
        instantsByTrack.set(event.trackId, arr);
      }
      arr.push({ eventId: event.id, x: cx, labelWidth });
    }
    const laneByEventId = new Map<string, number>();
    for (const items of instantsByTrack.values()) {
      const { assignments } = assignLabelLanes(
        items.map(({ x, labelWidth }) => ({ x, labelWidth })),
        this.labelMinGap
      );
      items.forEach((it, i) => {
        laneByEventId.set(it.eventId, assignments[i]);
      });
    }

    return this.events()
      .flatMap((event): EventPill[] => {
        const row = rowByTrack.get(event.trackId);
        if (!row) return [];
        const isPreview = preview?.eventId === event.id;
        const effectiveStart = isPreview ? preview.start : event.start;
        const effectiveEnd = isPreview ? preview.end : event.end;
        // Skip the validity guard for the actively-dragged event so it stays
        // on screen even when the cursor briefly crosses unit-boundary
        // limits (e.g. month=15 in a Gregorian system).
        if (!isPreview && !isValidTimePointFor(effectiveStart, system))
          return [];
        let startTick: bigint;
        try {
          startTick = timePointToAbsolute(effectiveStart, system);
        } catch {
          return [];
        }
        const isInstant = !effectiveEnd;
        const color = event.color ?? row.track.color;

        // Axis line sits between the label area and the event area.
        const axisY = row.y + row.laneCount * this.labelLaneHeight;
        // Event area runs axisY → axisY + eventAreaHeight.

        if (isInstant) {
          const cx = this.labelGutter + tickToX(startTick, bounds, available);
          const laneIndex = laneByEventId.get(event.id) ?? 0;
          // Diamond is vertically centred in the event area, with its top
          // and bottom points symmetric about the centre line. Top point
          // sits a few px below the axis so the stalk is always visible.
          const diamondCY = axisY + this.eventAreaHeight / 2;
          const half = this.diamondHalf;
          const topY = diamondCY - half;
          const bottomY = diamondCY + half;
          const points = [
            `${cx},${topY}`,
            `${cx + half},${diamondCY}`,
            `${cx},${bottomY}`,
            `${cx - half},${diamondCY}`,
          ].join(' ');
          // Label sits in its assigned lane above the axis. Lane 0 is
          // closest to the axis (just above it), higher lanes float
          // further up.
          // Convert lane index → Y. We render lane 0 nearest the axis.
          const labelY =
            axisY -
            (laneIndex * this.labelLaneHeight + this.labelLaneHeight / 2);
          // Hit area generously around the diamond (24x24).
          const hitSize = 24;
          return [
            {
              event,
              isInstant: true,
              color,
              cx,
              axisY,
              diamondCY,
              labelY,
              diamondPoints: points,
              hitX: cx - hitSize / 2,
              hitY: diamondCY - hitSize / 2,
              hitW: hitSize,
              hitH: hitSize,
              // unused for instants but make TS happy via undefined
              titleFits: true,
            },
          ];
        }

        // Ranged event.
        // effectiveEnd is defined here (we're in the !isInstant branch).
        // Validate it; if invalid, fall back to startTick to avoid blowing
        // out coordinates.
        let endTick = startTick;
        if (effectiveEnd && isValidTimePointFor(effectiveEnd, system)) {
          try {
            endTick = timePointToAbsolute(effectiveEnd, system);
          } catch {
            endTick = startTick;
          }
        }
        const startX = this.labelGutter + tickToX(startTick, bounds, available);
        const endX = this.labelGutter + tickToX(endTick, bounds, available);
        // Clamp to the visible viewport so a long-range event doesn't blow
        // out the SVG coordinate space and stretch the entire layer.
        const viewportLeft = this.labelGutter;
        const viewportRight = width;
        const rectLeft = Math.max(viewportLeft, Math.min(startX, endX));
        const rectRight = Math.min(viewportRight, Math.max(startX, endX));
        const rectWidth = Math.max(2, rectRight - rectLeft);
        const rectY = axisY + this.eventAreaPadding;
        const rectHeight = this.eventAreaHeight - 2 * this.eventAreaPadding;
        // Decide whether the title fits inside the rect (controls tooltip).
        const titleApproxWidth =
          event.title.length * this.labelCharWidth + 16; /* padding */
        const titleFits = titleApproxWidth <= rectWidth;
        return [
          {
            event,
            isInstant: false,
            color,
            x: rectLeft,
            y: rectY,
            width: rectWidth,
            height: rectHeight,
            rangedLabelY: rectY + rectHeight / 2,
            titleFits,
            axisY,
          },
        ];
      })
      .sort((a, b) => Number(a.isInstant) - Number(b.isInstant));
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
      if (!isValidTimePointFor(era.start, system)) return [];
      if (!isValidTimePointFor(era.end, system)) return [];
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
    this.initialFitDone = false;
    this.timelineService.loadConfig(elementId);
    const element = this.projectState.elements().find(e => e.id === elementId);
    if (element?.metadata?.[TIMELINE_CONFIG_META_KEY]) {
      this.initialFitDone = true;
    }
    this.pendingInitialFit.set(true);

    // Track route param changes when the user navigates to a different timeline
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('tabId');
        if (id && id !== this.config()?.elementId) {
          this.elementId.set(id);
          this.initialFitDone = false;
          this.timelineService.loadConfig(id);
          const el = this.projectState.elements().find(e => e.id === id);
          if (el?.metadata?.[TIMELINE_CONFIG_META_KEY]) {
            this.initialFitDone = true;
          }
          this.pendingInitialFit.set(true);
          // Cancel any in-flight pointer interactions from the previous tab.
          this.cancelActiveDrags();
        }
      });

    this.scheduleMeasureViewport();
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

  private scheduleMeasureViewport(): void {
    const measure = () => this.ngZone.run(() => this.measureViewport());
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(measure);
      });
      return;
    }
    queueMicrotask(measure);
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
    // dimensions aren't available until the browser has painted that layout.
    queueMicrotask(() => this.fitContents());
    this.scheduleMeasureViewport();
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
      defaultStart: absoluteToTimePoint(firstTick, system),
      defaultEnd: absoluteToTimePoint(lastTick, system),
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
    if (
      !isValidTimePointFor(era.start, system) ||
      !isValidTimePointFor(era.end, system)
    ) {
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
      start: absoluteToTimePoint(newStart, system),
      end: absoluteToTimePoint(newEnd, system),
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
    const system = this.activeSystem();
    if (
      preview?.eraId === era.id &&
      system &&
      isValidTimePointFor(preview.start, system) &&
      isValidTimePointFor(preview.end, system)
    ) {
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
    if (!isValidTimePointFor(ev.start, system)) return;
    if (ev.end && !isValidTimePointFor(ev.end, system)) return;
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
      start: absoluteToTimePoint(newStart, system),
      end: drag.wasRanged ? absoluteToTimePoint(newEnd, system) : undefined,
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
    const system = this.activeSystem();
    if (
      preview?.eventId === ev.id &&
      system &&
      this.isValidEventPreview(preview, system)
    ) {
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
    try {
      this.bounds.set(computeDefaultBounds(system, config.events, config.eras));
    } catch (err) {
      this.logger.warn(
        'Timeline',
        'fitContents failed – timeline data may be corrupt; using default bounds',
        err
      );
      this.bounds.set({ minTick: 0n, maxTick: 100n });
    }
  }

  private isValidEventPreview(
    preview: { start: TimePoint; end: TimePoint | undefined },
    system: TimeSystem
  ): boolean {
    return (
      isValidTimePointFor(preview.start, system) &&
      (!preview.end || isValidTimePointFor(preview.end, system))
    );
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
    // Drags initiated on an event pill or era band may not receive
    // subsequent move events on the originating element (e.g. when the
    // pointer leaves the rect bounds before pointer capture kicks in, or
    // when capture lands on a child rect that is hidden during the drag).
    // Routing all moves through the canvas-level handler guarantees the
    // in-flight drag preview keeps tracking the cursor and the element
    // never "vanishes" mid-drag.
    if (this.eventDrag?.pointerId === event.pointerId) {
      this.onEventPointerMove(event);
      return;
    }
    if (this.eraDrag?.pointerId === event.pointerId) {
      this.onEraPointerMove(event);
      return;
    }
    if (this.pointerDrag?.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - this.pointerDrag.startX;
    const available = Math.max(1, this.viewWidth() - this.labelGutter);
    this.bounds.set(panBounds(this.pointerDrag.startBounds, dx, available));
  }

  protected onPointerUp(event: PointerEvent): void {
    // Mirror the move handler: commit any in-flight event/era drag
    // before falling through to pan-drag cleanup.
    if (this.eventDrag?.pointerId === event.pointerId) {
      const eventId = this.eventDrag.eventId;
      const ev = this.events().find(e => e.id === eventId);
      if (ev) this.onEventPointerUp(event, ev);
      else {
        // Source event vanished mid-drag: clear state without committing.
        this.eventDrag = null;
        this.eventDragPreview.set(null);
      }
      return;
    }
    if (this.eraDrag?.pointerId === event.pointerId) {
      const eraId = this.eraDrag.eraId;
      const era = this.eras().find(e => e.id === eraId);
      if (era) this.onEraPointerUp(event, era);
      else {
        this.eraDrag = null;
        this.eraDragPreview.set(null);
      }
      return;
    }
    if (this.pointerDrag?.pointerId !== event.pointerId) {
      return;
    }
    this.pointerDrag = null;
  }
}

export { compareTimePoints } from '@models/time-system';
