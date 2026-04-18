import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import {
  TIME_SYSTEM_TEMPLATES,
  type TimePoint,
  timePointToAbsolute,
} from '@models/time-system';
import {
  createDefaultTimelineConfig,
  type TimelineConfig,
  type TimelineEra,
  type TimelineEvent,
} from '@models/timeline.model';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { TimelineService } from '@services/timeline/timeline.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineTabComponent } from './timeline-tab.component';

describe('TimelineTabComponent', () => {
  let component: TimelineTabComponent;
  let fixture: ComponentFixture<TimelineTabComponent>;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockDialogGateway: {
    openRenameDialog: ReturnType<typeof vi.fn>;
    openConfirmationDialog: ReturnType<typeof vi.fn>;
  };

  const defaultConfig: TimelineConfig = {
    ...createDefaultTimelineConfig('t-1'),
    // Commit the first installed template so the timeline is past the
    // one-time "pick a system" setup overlay by default. Tests that need
    // to exercise the setup state reset `timeSystemId` explicitly.
    timeSystemId: TIME_SYSTEM_TEMPLATES[0].id,
  };
  const timelineSignal = signal<TimelineConfig | null>(defaultConfig);

  const mockTimelineService = {
    activeConfig: timelineSignal.asReadonly(),
    loadConfig: vi.fn(() => defaultConfig),
    saveConfig: vi.fn(),
    getAvailableSystems: vi.fn(() => TIME_SYSTEM_TEMPLATES),
    getActiveSystem: vi.fn(() => TIME_SYSTEM_TEMPLATES[0]),
    setTimeSystem: vi.fn(),
    addTrack: vi.fn(() => 'track-2'),
    removeTrack: vi.fn(),
    updateTrack: vi.fn(),
    addEvent: vi.fn(() => 'ev-1'),
    updateEvent: vi.fn(),
    removeEvent: vi.fn(),
    addEra: vi.fn(() => 'era-1'),
    updateEra: vi.fn(),
    removeEra: vi.fn(),
  };

  const mockRoute = {
    snapshot: { paramMap: new Map([['tabId', 't-1']]) } as unknown as {
      paramMap: { get(key: string): string | null };
    },
    paramMap: of({ get: (k: string) => (k === 'tabId' ? 't-1' : null) }),
  };
  // Provide a proper get() on snapshot
  (
    mockRoute.snapshot.paramMap as unknown as { get: (k: string) => string }
  ).get = (k: string): string => (k === 'tabId' ? 't-1' : '');

  const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };

  const mockProjectState = {
    elements: signal<unknown[]>([]),
    updateElementMetadata: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    timelineSignal.set(defaultConfig);
    mockProjectState.elements.set([]);

    mockDialog = {
      open: vi.fn(() => ({
        afterClosed: () => of(undefined),
      })),
    };

    mockDialogGateway = {
      openRenameDialog: vi.fn(() => Promise.resolve(null)),
      openConfirmationDialog: vi.fn(() => Promise.resolve(false)),
    };

    await TestBed.configureTestingModule({
      imports: [TimelineTabComponent, NoopAnimationsModule],
      providers: [
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MatDialog, useValue: mockDialog },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
      ],
    })
      .overrideComponent(TimelineTabComponent, {
        set: {
          providers: [
            { provide: TimelineService, useValue: mockTimelineService },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TimelineTabComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads the timeline config on init using the tabId route param', () => {
    fixture.detectChanges();
    expect(mockTimelineService.loadConfig).toHaveBeenCalledWith('t-1');
  });

  it('commits the pending time system through the service', () => {
    // The timeline locks in its time system on first commit; switching
    // after commit is intentionally not supported from the toolbar.
    fixture.detectChanges();
    component['pendingSystemId'].set('iso-year');
    component['onCommitTimeSystem']();
    expect(mockTimelineService.setTimeSystem).toHaveBeenCalledWith('iso-year');
  });

  it('ignores commit when no pending system is selected', () => {
    fixture.detectChanges();
    component['pendingSystemId'].set('');
    component['onCommitTimeSystem']();
    expect(mockTimelineService.setTimeSystem).not.toHaveBeenCalled();
  });

  it('ignores commit when pending system is not installed', () => {
    fixture.detectChanges();
    component['pendingSystemId'].set('not-a-real-system');
    component['onCommitTimeSystem']();
    expect(mockTimelineService.setTimeSystem).not.toHaveBeenCalled();
  });

  it('delegates add-track to the service', async () => {
    fixture.detectChanges();
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce('History');
    await component['onAddTrack']();
    expect(mockDialogGateway.openRenameDialog).toHaveBeenCalled();
    expect(mockTimelineService.addTrack).toHaveBeenCalledWith('History');
  });

  it('adds an era with derived bounds', async () => {
    fixture.detectChanges();
    const saveResult = {
      kind: 'save' as const,
      era: {
        id: 'ignored',
        name: 'Era 1',
        start: {
          systemId: TIME_SYSTEM_TEMPLATES[0].id,
          units: ['2024', '1', '1'],
        } as TimePoint,
        end: {
          systemId: TIME_SYSTEM_TEMPLATES[0].id,
          units: ['2024', '6', '1'],
        } as TimePoint,
        color: '#abcdef',
      },
    };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of(saveResult),
    });
    await component['onAddEra']();
    expect(mockTimelineService.addEra).toHaveBeenCalled();
    const payload = (
      mockTimelineService.addEra.mock.calls as unknown as [
        { name: string; start: TimePoint; end: TimePoint },
      ][]
    )[0][0];
    expect(payload.name).toBe('Era 1');
    expect(payload.start.systemId).toBe(TIME_SYSTEM_TEMPLATES[0].id);
    expect(payload.end.systemId).toBe(TIME_SYSTEM_TEMPLATES[0].id);
  });

  it('zooms in and out by updating the bounds signal', () => {
    fixture.detectChanges();
    const before = component['bounds']();
    component['onZoom'](0.5);
    const after = component['bounds']();
    const beforeSpan = before.maxTick - before.minTick;
    const afterSpan = after.maxTick - after.minTick;
    expect(afterSpan).toBeLessThan(beforeSpan);
  });

  it('opens the event dialog when add-event is clicked', async () => {
    fixture.detectChanges();
    await component['onAddEvent']();
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('handles dialog "save" result by calling addEvent', async () => {
    fixture.detectChanges();
    const saveResult = {
      kind: 'save' as const,
      event: {
        id: 'ignored',
        trackId: defaultConfig.tracks[0].id,
        title: 'Hello',
        start: {
          systemId: TIME_SYSTEM_TEMPLATES[0].id,
          units: ['2024', '1', '1'],
        } as TimePoint,
      },
    };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of(saveResult),
    });
    await component['onAddEvent']();
    expect(mockTimelineService.addEvent).toHaveBeenCalled();
    const arg = (
      mockTimelineService.addEvent.mock.calls as unknown as [
        { id?: string; title: string },
      ][]
    )[0][0];
    // id must be stripped so service assigns its own
    expect(arg.id).toBeUndefined();
    expect(arg.title).toBe('Hello');
  });

  it('handles dialog "delete" result by calling removeEvent', async () => {
    fixture.detectChanges();
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of({ kind: 'delete' as const, eventId: 'ev-123' }),
    });
    await component['onEventClick']({
      id: 'ev-123',
      trackId: defaultConfig.tracks[0].id,
      title: 'x',
      start: {
        systemId: TIME_SYSTEM_TEMPLATES[0].id,
        units: ['0', '0', '0'],
      },
    });
    expect(mockTimelineService.removeEvent).toHaveBeenCalledWith('ev-123');
  });

  it('renders the setup overlay when no time system is committed', () => {
    // Default config has timeSystemId = '', which means the user has not yet
    // committed a system — the component must show the setup overlay and
    // NOT the empty-state, because events/eras can't yet be authored.
    timelineSignal.set({ ...defaultConfig, timeSystemId: '' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="timeline-setup"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="timeline-empty"]')).toBeFalsy();
  });

  it('renders the empty state when a system is committed but no items exist', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="timeline-setup"]')).toBeFalsy();
    expect(el.querySelector('[data-testid="timeline-empty"]')).toBeTruthy();
  });

  // ─── Track label click (rename) ────────────────────────────────────────────

  it('renames track when dialog returns a new name', async () => {
    fixture.detectChanges();
    const track = defaultConfig.tracks[0];
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce('New Name');
    await component['onTrackLabelClick'](track);
    expect(mockTimelineService.updateTrack).toHaveBeenCalledWith(track.id, {
      name: 'New Name',
    });
  });

  it('skips rename when dialog is cancelled', async () => {
    fixture.detectChanges();
    const track = defaultConfig.tracks[0];
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce(null);
    await component['onTrackLabelClick'](track);
    expect(mockTimelineService.updateTrack).not.toHaveBeenCalled();
  });

  it('skips rename when dialog returns whitespace-only', async () => {
    fixture.detectChanges();
    const track = defaultConfig.tracks[0];
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce('   ');
    await component['onTrackLabelClick'](track);
    expect(mockTimelineService.updateTrack).not.toHaveBeenCalled();
  });

  it('skips rename when dialog returns the same name', async () => {
    fixture.detectChanges();
    const track = defaultConfig.tracks[0];
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce(track.name);
    await component['onTrackLabelClick'](track);
    expect(mockTimelineService.updateTrack).not.toHaveBeenCalled();
  });

  // ─── Add track cancelled ──────────────────────────────────────────────────

  it('does not add track when rename dialog is cancelled', async () => {
    fixture.detectChanges();
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce(null);
    await component['onAddTrack']();
    expect(mockTimelineService.addTrack).not.toHaveBeenCalled();
  });

  it('does not add track when name is whitespace-only', async () => {
    fixture.detectChanges();
    mockDialogGateway.openRenameDialog.mockResolvedValueOnce('  ');
    await component['onAddTrack']();
    expect(mockTimelineService.addTrack).not.toHaveBeenCalled();
  });

  // ─── Era click (edit / delete) ─────────────────────────────────────────────

  it('updates era when dialog returns save result', async () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-1',
      name: 'Era 1',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '6', '1'] },
      color: '#ff0000',
    };
    const updatedEra = { ...era, name: 'Updated Era' };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of({ kind: 'save' as const, era: updatedEra }),
    });
    await component['onEraClick'](era);
    expect(mockTimelineService.updateEra).toHaveBeenCalledWith('era-1', {
      name: 'Updated Era',
      start: updatedEra.start,
      end: updatedEra.end,
      color: updatedEra.color,
    });
  });

  it('deletes era when dialog returns delete result', async () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-1',
      name: 'Era 1',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '6', '1'] },
      color: '#ff0000',
    };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of({ kind: 'delete' as const, eraId: 'era-1' }),
    });
    await component['onEraClick'](era);
    expect(mockTimelineService.removeEra).toHaveBeenCalledWith('era-1');
  });

  it('does nothing when era dialog is dismissed', async () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-1',
      name: 'Era 1',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '6', '1'] },
      color: '#ff0000',
    };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of(undefined),
    });
    await component['onEraClick'](era);
    expect(mockTimelineService.updateEra).not.toHaveBeenCalled();
    expect(mockTimelineService.removeEra).not.toHaveBeenCalled();
  });

  // ─── Event click (update) ──────────────────────────────────────────────────

  it('updates event when dialog returns save result', async () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-1',
      trackId: defaultConfig.tracks[0].id,
      title: 'Old Title',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
    };
    const updatedEvent = { ...event, title: 'New Title' };
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of({ kind: 'save' as const, event: updatedEvent }),
    });
    await component['onEventClick'](event);
    expect(mockTimelineService.updateEvent).toHaveBeenCalledWith(
      'ev-1',
      expect.objectContaining({ title: 'New Title' })
    );
  });

  // ─── Pending system change ─────────────────────────────────────────────────

  it('updates pendingSystemId via onPendingSystemChange', () => {
    fixture.detectChanges();
    component['onPendingSystemChange']('custom-system');
    expect(component['pendingSystemId']()).toBe('custom-system');
  });

  // ─── Zoom and fit ──────────────────────────────────────────────────────────

  it('zooms out by increasing the tick span', () => {
    fixture.detectChanges();
    const before = component['bounds']();
    component['onZoom'](1.5);
    const after = component['bounds']();
    const beforeSpan = before.maxTick - before.minTick;
    const afterSpan = after.maxTick - after.minTick;
    expect(afterSpan).toBeGreaterThan(beforeSpan);
  });

  it('fit contents calls computeDefaultBounds and updates bounds', () => {
    fixture.detectChanges();
    // Set some arbitrary bounds first
    component['bounds'].set({ minTick: -1000n, maxTick: 1000n });
    component['onFit']();
    const after = component['bounds']();
    // After fit, bounds should be different from the arbitrary ones
    expect(after.minTick !== -1000n || after.maxTick !== 1000n).toBe(true);
  });

  // ─── Open time system settings ─────────────────────────────────────────────

  it('navigates to settings with time-systems section', () => {
    // Give the route paramMap the needed params
    const mockParams = new Map([
      ['tabId', 't-1'],
      ['username', 'alice'],
      ['slug', 'my-project'],
    ]);
    (
      mockRoute.snapshot.paramMap as unknown as {
        get: (k: string) => string | null;
      }
    ).get = (k: string) => mockParams.get(k) ?? null;
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    component['onOpenTimeSystemSettings']();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/project', 'alice', 'my-project', 'settings'],
      { queryParams: { section: 'time-systems' } }
    );
  });

  it('does not navigate when username is missing', () => {
    const mockParams = new Map([['tabId', 't-1']]);
    (
      mockRoute.snapshot.paramMap as unknown as {
        get: (k: string) => string | null;
      }
    ).get = (k: string) => mockParams.get(k) ?? null;
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    component['onOpenTimeSystemSettings']();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // ─── Pointer pan interaction ───────────────────────────────────────────────

  it('pans the timeline on pointer drag', () => {
    fixture.detectChanges();
    const before = component['bounds']();

    // Simulate pointer down on the background (not on an event/era pill)
    const downEvent = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 1,
    });
    Object.defineProperty(downEvent, 'target', {
      value: {
        closest: () => null,
        setPointerCapture: vi.fn(),
      },
    });
    component['onPointerDown'](downEvent);

    // Simulate pointer move
    const moveEvent = new PointerEvent('pointermove', {
      clientX: 300,
      pointerId: 1,
    });
    component['onPointerMove'](moveEvent);

    const during = component['bounds']();
    // Panning should shift bounds
    expect(during.minTick !== before.minTick).toBe(true);

    // Simulate pointer up
    const upEvent = new PointerEvent('pointerup', { pointerId: 1 });
    component['onPointerUp'](upEvent);
  });

  it('ignores pointer down on non-left button', () => {
    fixture.detectChanges();
    const downEvent = new PointerEvent('pointerdown', {
      button: 2,
      clientX: 200,
      pointerId: 1,
    });
    component['onPointerDown'](downEvent);
    // pointerDrag should not be set
    expect(component['pointerDrag']).toBeNull();
  });

  it('ignores pointer move without prior down', () => {
    fixture.detectChanges();
    const before = component['bounds']();
    const moveEvent = new PointerEvent('pointermove', {
      clientX: 300,
      pointerId: 1,
    });
    component['onPointerMove'](moveEvent);
    expect(component['bounds']()).toEqual(before);
  });

  // ─── Wheel interaction ─────────────────────────────────────────────────────

  it('zooms in on wheel down', () => {
    fixture.detectChanges();
    const before = component['bounds']();
    const beforeSpan = before.maxTick - before.minTick;

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
    });
    Object.defineProperty(wheelEvent, 'currentTarget', {
      value: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 800,
          height: 400,
        }),
      },
    });
    wheelEvent.preventDefault = vi.fn();
    component['onWheel'](wheelEvent);

    const after = component['bounds']();
    const afterSpan = after.maxTick - after.minTick;
    expect(afterSpan).toBeLessThan(beforeSpan);
  });

  // ─── Era drag interaction ──────────────────────────────────────────────────

  it('handles era drag move and commits on pointer up', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-d1',
      name: 'Drag Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#00ff00',
    };
    const configWithEra: TimelineConfig = {
      ...defaultConfig,
      eras: [era],
    };
    timelineSignal.set(configWithEra);
    fixture.detectChanges();

    // Pointer down on era
    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 10,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEraPointerDown'](downEvt, era, 'move');

    // Pointer move with enough dx to trigger moved=true
    const moveEvt = new PointerEvent('pointermove', {
      clientX: 250,
      pointerId: 10,
    });
    component['onEraPointerMove'](moveEvt);
    expect(component['eraDragPreview']()).not.toBeNull();

    // Pointer up commits the drag
    const upEvt = new PointerEvent('pointerup', { pointerId: 10 });
    component['onEraPointerUp'](upEvt, era);
    expect(mockTimelineService.updateEra).toHaveBeenCalledWith(
      'era-d1',
      expect.objectContaining({
        start: expect.any(Object),
        end: expect.any(Object),
      })
    );
    expect(component['eraDragPreview']()).toBeNull();
  });

  it('opens era dialog on non-moved pointer up (click)', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-click',
      name: 'Click Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#ff0000',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 11,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEraPointerDown'](downEvt, era, 'move');

    // No move — pointer up immediately → treated as click
    const upEvt = new PointerEvent('pointerup', { pointerId: 11 });
    component['onEraPointerUp'](upEvt, era);
    // Dialog should open (onEraClick is called)
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('ignores era pointer down on non-left button', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-ign',
      name: 'Ignore',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#aaa',
    };
    const downEvt = new PointerEvent('pointerdown', {
      button: 2,
      clientX: 200,
      pointerId: 99,
    });
    component['onEraPointerDown'](downEvt, era, 'move');
    expect(component['eraDrag']).toBeNull();
  });

  it('handles era resize-start clamping', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-rs',
      name: 'Resize Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#00f',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 12,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEraPointerDown'](downEvt, era, 'resize-start');

    // Move far right so start would pass end → clamped
    const moveEvt = new PointerEvent('pointermove', {
      clientX: 2000,
      pointerId: 12,
    });
    component['onEraPointerMove'](moveEvt);
    const preview = component['eraDragPreview']();
    expect(preview).not.toBeNull();
    // Start should be clamped to not exceed end
    if (preview) {
      const startTick = timePointToAbsolute(preview.start, system);
      const endTick = timePointToAbsolute(preview.end, system);
      expect(startTick).toBeLessThanOrEqual(endTick);
    }
  });

  it('handles era resize-end clamping', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-re',
      name: 'Resize End Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#0f0',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 600,
      pointerId: 13,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEraPointerDown'](downEvt, era, 'resize-end');

    // Move far left so end would pass start → clamped
    const moveEvt = new PointerEvent('pointermove', {
      clientX: -1000,
      pointerId: 13,
    });
    component['onEraPointerMove'](moveEvt);
    const preview = component['eraDragPreview']();
    expect(preview).not.toBeNull();
    if (preview) {
      const startTick = timePointToAbsolute(preview.start, system);
      const endTick = timePointToAbsolute(preview.end, system);
      expect(endTick).toBeGreaterThanOrEqual(startTick);
    }
  });

  // ─── Event drag interaction ────────────────────────────────────────────────

  it('handles event drag move and commits on pointer up', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-drag1',
      trackId: defaultConfig.tracks[0].id,
      title: 'Draggable Event',
      start: { systemId: system.id, units: ['2022', '6', '1'] },
      end: { systemId: system.id, units: ['2023', '6', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 300,
      pointerId: 20,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEventPointerDown'](downEvt, event, 'move');

    const moveEvt = new PointerEvent('pointermove', {
      clientX: 350,
      pointerId: 20,
    });
    component['onEventPointerMove'](moveEvt);
    expect(component['eventDragPreview']()).not.toBeNull();

    const upEvt = new PointerEvent('pointerup', { pointerId: 20 });
    component['onEventPointerUp'](upEvt, event);
    expect(mockTimelineService.updateEvent).toHaveBeenCalledWith(
      'ev-drag1',
      expect.objectContaining({
        start: expect.any(Object),
        end: expect.any(Object),
      })
    );
    expect(component['eventDragPreview']()).toBeNull();
  });

  it('opens event dialog on non-moved pointer up (click)', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-click1',
      trackId: defaultConfig.tracks[0].id,
      title: 'Click Event',
      start: { systemId: system.id, units: ['2022', '1', '1'] },
      end: { systemId: system.id, units: ['2023', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 300,
      pointerId: 21,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEventPointerDown'](downEvt, event, 'move');

    const upEvt = new PointerEvent('pointerup', { pointerId: 21 });
    component['onEventPointerUp'](upEvt, event);
    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('ignores event pointer down on non-left button', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-ign',
      trackId: defaultConfig.tracks[0].id,
      title: 'Ignore',
      start: { systemId: system.id, units: ['2022', '1', '1'] },
    };
    const downEvt = new PointerEvent('pointerdown', {
      button: 2,
      clientX: 300,
      pointerId: 22,
    });
    component['onEventPointerDown'](downEvt, event, 'move');
    expect(component['eventDrag']).toBeNull();
  });

  it('ignores resize on instant (non-ranged) event', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-instant',
      trackId: defaultConfig.tracks[0].id,
      title: 'Instant Event',
      start: { systemId: system.id, units: ['2022', '1', '1'] },
      // No end → instant event
    };
    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 300,
      pointerId: 23,
    });
    component['onEventPointerDown'](downEvt, event, 'resize-start');
    expect(component['eventDrag']).toBeNull();
  });

  it('handles event resize-start clamping', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-rs',
      trackId: defaultConfig.tracks[0].id,
      title: 'Resize Event',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 24,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEventPointerDown'](downEvt, event, 'resize-start');

    // Move far right
    const moveEvt = new PointerEvent('pointermove', {
      clientX: 2000,
      pointerId: 24,
    });
    component['onEventPointerMove'](moveEvt);
    const preview = component['eventDragPreview']();
    expect(preview).not.toBeNull();
    if (preview) {
      const startTick = timePointToAbsolute(preview.start, system);
      const endTick = preview.end
        ? timePointToAbsolute(preview.end, system)
        : startTick;
      expect(startTick).toBeLessThanOrEqual(endTick);
    }
  });

  it('handles event resize-end clamping', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'ev-re',
      trackId: defaultConfig.tracks[0].id,
      title: 'Resize End Event',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();

    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 600,
      pointerId: 25,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEventPointerDown'](downEvt, event, 'resize-end');

    // Move far left
    const moveEvt = new PointerEvent('pointermove', {
      clientX: -1000,
      pointerId: 25,
    });
    component['onEventPointerMove'](moveEvt);
    const preview = component['eventDragPreview']();
    expect(preview).not.toBeNull();
    if (preview && preview.end) {
      const startTick = timePointToAbsolute(preview.start, system);
      const endTick = timePointToAbsolute(preview.end, system);
      expect(endTick).toBeGreaterThanOrEqual(startTick);
    }
  });

  // ─── Cancel active drags ──────────────────────────────────────────────────

  it('cancelActiveDrags clears all drag state', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'era-cancel',
      name: 'Cancel Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#f00',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();

    // Start era drag
    const downEvt = new PointerEvent('pointerdown', {
      button: 0,
      clientX: 200,
      pointerId: 30,
    });
    Object.defineProperty(downEvt, 'target', {
      value: { setPointerCapture: vi.fn() },
    });
    downEvt.stopPropagation = vi.fn();
    component['onEraPointerDown'](downEvt, era, 'move');
    expect(component['eraDrag']).not.toBeNull();

    component['cancelActiveDrags']();
    expect(component['eraDrag']).toBeNull();
    expect(component['eventDrag']).toBeNull();
    expect(component['pointerDrag']).toBeNull();
    expect(component['eraDragPreview']()).toBeNull();
    expect(component['eventDragPreview']()).toBeNull();
  });

  // ─── Computed properties ───────────────────────────────────────────────────

  it('tracks computed returns sorted tracks by order', () => {
    fixture.detectChanges();
    const config: TimelineConfig = {
      ...defaultConfig,
      tracks: [
        {
          id: 't3',
          name: 'Third',
          color: '#f00',
          visible: true,
          order: 3,
        },
        {
          id: 't1',
          name: 'First',
          color: '#0f0',
          visible: true,
          order: 1,
        },
        {
          id: 't2',
          name: 'Second',
          color: '#00f',
          visible: true,
          order: 2,
        },
      ],
    };
    timelineSignal.set(config);
    fixture.detectChanges();
    const sorted = component['tracks']();
    expect(sorted.map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('trackRows computed maps tracks to y positions', () => {
    fixture.detectChanges();
    const rows = component['trackRows']();
    expect(rows.length).toBe(defaultConfig.tracks.length);
    rows.forEach((row, idx) => {
      expect(row.y).toBe(idx * component['trackHeight']);
    });
  });

  it('tracksCanvasHeight is at least one track height', () => {
    fixture.detectChanges();
    expect(component['tracksCanvasHeight']()).toBeGreaterThanOrEqual(
      component['trackHeight']
    );
  });

  it('eventPills computed returns pills for events matching active system', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'pill-ev',
      trackId: defaultConfig.tracks[0].id,
      title: 'Pill Event',
      start: { systemId: system.id, units: ['2022', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();
    const pills = component['eventPills']();
    expect(pills.length).toBe(1);
    expect(pills[0].event.id).toBe('pill-ev');
    expect(pills[0].width).toBeGreaterThanOrEqual(80); // minWidth
  });

  it('eventPills filters out events from a different system', () => {
    fixture.detectChanges();
    const event: TimelineEvent = {
      id: 'pill-other',
      trackId: defaultConfig.tracks[0].id,
      title: 'Other System Event',
      start: { systemId: 'non-existent-system', units: ['1', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();
    const pills = component['eventPills']();
    expect(pills.length).toBe(0);
  });

  it('eraBands computed returns bands for eras matching active system', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const era: TimelineEra = {
      id: 'band-era',
      name: 'Band Era',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
      color: '#ff0',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();
    const bands = component['eraBands']();
    expect(bands.length).toBe(1);
    expect(bands[0].id).toBe('band-era');
    expect(bands[0].width).toBeGreaterThan(0);
  });

  it('eraBands filters out eras from a different system', () => {
    fixture.detectChanges();
    const era: TimelineEra = {
      id: 'band-other',
      name: 'Other',
      start: { systemId: 'other-sys', units: ['1'] },
      end: { systemId: 'other-sys', units: ['2'] },
      color: '#000',
    };
    timelineSignal.set({ ...defaultConfig, eras: [era] });
    fixture.detectChanges();
    const bands = component['eraBands']();
    expect(bands.length).toBe(0);
  });

  it('tickMarks computed returns marks when active system is set', () => {
    fixture.detectChanges();
    const marks = component['tickMarks']();
    expect(marks.length).toBeGreaterThan(0);
    marks.forEach(m => {
      expect(typeof m.x).toBe('number');
      expect(typeof m.label).toBe('string');
    });
  });

  it('tickMarks is empty when no active system', () => {
    timelineSignal.set({ ...defaultConfig, timeSystemId: '' });
    fixture.detectChanges();
    expect(component['tickMarks']()).toEqual([]);
  });

  // ─── needsSystemSelection ─────────────────────────────────────────────────

  it('needsSystemSelection is false when config is null', () => {
    timelineSignal.set(null);
    fixture.detectChanges();
    expect(component['needsSystemSelection']()).toBe(false);
  });

  it('needsSystemSelection is true when committed system is not found', () => {
    timelineSignal.set({
      ...defaultConfig,
      timeSystemId: 'non-existent-system',
    });
    fixture.detectChanges();
    expect(component['needsSystemSelection']()).toBe(true);
  });

  // ─── hasActiveSystem / activeSystemName ────────────────────────────────────

  it('hasActiveSystem returns true when system is committed', () => {
    fixture.detectChanges();
    expect(component['hasActiveSystem']()).toBe(true);
  });

  it('hasActiveSystem returns false when no system committed', () => {
    timelineSignal.set({ ...defaultConfig, timeSystemId: '' });
    fixture.detectChanges();
    expect(component['hasActiveSystem']()).toBe(false);
  });

  it('activeSystemName returns the name of the active system', () => {
    fixture.detectChanges();
    expect(component['activeSystemName']()).toBe(TIME_SYSTEM_TEMPLATES[0].name);
  });

  it('activeSystemName returns empty when no system', () => {
    timelineSignal.set({ ...defaultConfig, timeSystemId: '' });
    fixture.detectChanges();
    expect(component['activeSystemName']()).toBe('');
  });

  // ─── Event pills with ranged events ────────────────────────────────────────

  it('eventPills gives wider pill for ranged events', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'pill-ranged',
      trackId: defaultConfig.tracks[0].id,
      title: 'Ranged',
      start: { systemId: system.id, units: ['2020', '1', '1'] },
      end: { systemId: system.id, units: ['2025', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();
    const pills = component['eventPills']();
    expect(pills.length).toBe(1);
    // Width should be at least minWidth (80)
    expect(pills[0].width).toBeGreaterThanOrEqual(80);
  });

  it('eventPills omits events whose track does not exist', () => {
    fixture.detectChanges();
    const system = TIME_SYSTEM_TEMPLATES[0];
    const event: TimelineEvent = {
      id: 'pill-notrack',
      trackId: 'nonexistent-track',
      title: 'Orphan',
      start: { systemId: system.id, units: ['2022', '1', '1'] },
    };
    timelineSignal.set({ ...defaultConfig, events: [event] });
    fixture.detectChanges();
    const pills = component['eventPills']();
    expect(pills.length).toBe(0);
  });

  // ─── Add event with no config / no system ──────────────────────────────────

  it('does not open dialog when config is null for addEvent', async () => {
    timelineSignal.set(null);
    fixture.detectChanges();
    await component['onAddEvent']();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('does not open dialog when config is null for addEra', async () => {
    timelineSignal.set(null);
    fixture.detectChanges();
    await component['onAddEra']();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('handles era dialog cancel for addEra', async () => {
    fixture.detectChanges();
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => of(undefined),
    });
    await component['onAddEra']();
    expect(mockTimelineService.addEra).not.toHaveBeenCalled();
  });
});
