import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { TIME_SYSTEM_TEMPLATES, type TimePoint } from '@models/time-system';
import {
  createDefaultTimelineConfig,
  type TimelineConfig,
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
});
