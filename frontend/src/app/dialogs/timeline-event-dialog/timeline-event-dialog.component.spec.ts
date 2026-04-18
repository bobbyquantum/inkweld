import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GREGORIAN_SYSTEM, RELATIVE_YEARS_SYSTEM } from '@models/time-system';
import type { TimelineTrack } from '@models/timeline.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TimelineEventDialogComponent,
  type TimelineEventDialogData,
} from './timeline-event-dialog.component';

const mockTrack: TimelineTrack = {
  id: 'track-1',
  name: 'Main Track',
  color: '#ff0000',
  visible: true,
  order: 0,
};

const baseData: TimelineEventDialogData = {
  event: null,
  tracks: [mockTrack],
  system: GREGORIAN_SYSTEM,
};

async function createComponent(data: TimelineEventDialogData = baseData) {
  const closeSpy = vi.fn();
  await TestBed.configureTestingModule({
    imports: [TimelineEventDialogComponent, NoopAnimationsModule],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: closeSpy } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TimelineEventDialogComponent);
  fixture.detectChanges();
  return { fixture, closeSpy, component: fixture.componentInstance };
}

describe('TimelineEventDialogComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders for creating a new event', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders for editing an existing event', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'evt-1',
        trackId: 'track-1',
        title: 'Existing Event',
        start: { systemId: 'gregorian', units: ['2024', '6', '15'] },
      },
    };
    const { fixture } = await createComponent(data);
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('initializes form with seeded values from existing event', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'evt-1',
        trackId: 'track-1',
        title: 'Test Event',
        start: { systemId: 'gregorian', units: ['2024', '3', '10'] },
      },
    };
    const { component } = await createComponent(data);
    const form = (
      component as unknown as { form: { value: { title: string } } }
    ).form;
    expect(form.value.title).toBe('Test Event');
  });

  it('initializes defaultTrackId when provided', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      defaultTrackId: 'track-1',
    };
    const { component } = await createComponent(data);
    const form = (
      component as unknown as {
        form: { controls: { trackId: { value: string } } };
      }
    ).form;
    expect(form.controls.trackId.value).toBe('track-1');
  });

  it('isGregorian() returns true for Gregorian system', async () => {
    const { component } = await createComponent();
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(true);
  });

  it('isGregorian() returns false for non-Gregorian system', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      system: RELATIVE_YEARS_SYSTEM,
    };
    const { component } = await createComponent(data);
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(false);
  });

  it('combinedStart() returns parseSeparator-joined unit values', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'e1',
        trackId: 'track-1',
        title: 'T',
        start: { systemId: 'gregorian', units: ['2024', '1', '1'] },
      },
    };
    const { component } = await createComponent(data);
    const combined = (
      component as unknown as { combinedStart: () => string }
    ).combinedStart();
    expect(combined).toContain('2024');
  });

  describe('onCancel()', () => {
    it('closes dialog without a value', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onCancel: () => void }).onCancel();
      expect(closeSpy).toHaveBeenCalledWith();
    });
  });

  describe('onDelete()', () => {
    it('closes dialog with delete result for existing event', async () => {
      const data: TimelineEventDialogData = {
        ...baseData,
        event: {
          id: 'del-1',
          trackId: 'track-1',
          title: 'ToDelete',
          start: { systemId: 'gregorian', units: ['2024', '1', '1'] },
        },
      };
      const { component, closeSpy } = await createComponent(data);
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).toHaveBeenCalledWith({
        kind: 'delete',
        eventId: 'del-1',
      });
    });

    it('does nothing when there is no event (new mode)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('onSave()', () => {
    it('does not save when form is invalid (empty title)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('saves event with valid Gregorian date', async () => {
      const data: TimelineEventDialogData = {
        ...baseData,
        event: null,
        tracks: [mockTrack],
        system: GREGORIAN_SYSTEM,
      };
      const { component, closeSpy } = await createComponent(data);
      const form = (
        component as unknown as {
          form: {
            controls: {
              title: { setValue: (v: string) => void };
              trackId: { setValue: (v: string) => void };
              startUnits: {
                controls: Array<{ setValue: (v: string) => void }>;
              };
            };
          };
        }
      ).form;
      form.controls.title.setValue('My Event');
      form.controls.trackId.setValue('track-1');
      form.controls.startUnits.controls[0].setValue('2024');
      form.controls.startUnits.controls[1].setValue('6');
      form.controls.startUnits.controls[2].setValue('15');
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'save' })
      );
    });
  });

  describe('with non-Gregorian system', () => {
    it('renders unit fields for the system', async () => {
      const data: TimelineEventDialogData = {
        ...baseData,
        system: RELATIVE_YEARS_SYSTEM,
      };
      const { fixture } = await createComponent(data);
      const unitFields = fixture.nativeElement.querySelectorAll(
        '[data-testid^="timeline-event-start-unit-"]'
      );
      expect(unitFields.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Ranged event save ──────────────────────────────────────────────────────

  it('saves ranged event with end date', async () => {
    const { component, closeSpy } = await createComponent();
    const form = (
      component as unknown as {
        form: {
          controls: {
            title: { setValue: (v: string) => void };
            trackId: { setValue: (v: string) => void };
            ranged: { setValue: (v: boolean) => void };
            startUnits: {
              controls: Array<{ setValue: (v: string) => void }>;
            };
            endUnits: { controls: Array<{ setValue: (v: string) => void }> };
          };
        };
      }
    ).form;
    form.controls.title.setValue('Ranged Event');
    form.controls.trackId.setValue('track-1');
    form.controls.ranged.setValue(true);
    form.controls.startUnits.controls[0].setValue('2020');
    form.controls.startUnits.controls[1].setValue('1');
    form.controls.startUnits.controls[2].setValue('1');
    form.controls.endUnits.controls[0].setValue('2025');
    form.controls.endUnits.controls[1].setValue('6');
    form.controls.endUnits.controls[2].setValue('15');
    (component as unknown as { onSave: () => void }).onSave();
    expect(closeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'save',
        event: expect.objectContaining({
          title: 'Ranged Event',
          end: expect.objectContaining({
            units: ['2025', '6', '15'],
          }),
        }),
      })
    );
  });

  // ─── Combined end ──────────────────────────────────────────────────────────

  it('combinedEnd returns joined end unit values', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'e2',
        trackId: 'track-1',
        title: 'T',
        start: { systemId: 'gregorian', units: ['2024', '1', '1'] },
        end: { systemId: 'gregorian', units: ['2025', '12', '31'] },
      },
    };
    const { component } = await createComponent(data);
    const combined = (
      component as unknown as { combinedEnd: () => string }
    ).combinedEnd();
    expect(combined).toContain('2025');
  });

  // ─── Date change handlers ──────────────────────────────────────────────────

  it('onStartDateChange updates start units from ISO date', async () => {
    const { component } = await createComponent();
    const changeHandler = component as unknown as {
      onStartDateChange: (v: string) => void;
      startUnits: () => { getRawValue: () => string[] };
    };
    changeHandler.onStartDateChange('2023-04-15');
    const values = changeHandler.startUnits().getRawValue();
    expect(values[0]).toBe('2023');
    expect(values[1]).toBe('4');
    expect(values[2]).toBe('15');
  });

  it('onEndDateChange updates end units from ISO date', async () => {
    const { component } = await createComponent();
    const changeHandler = component as unknown as {
      onEndDateChange: (v: string) => void;
      endUnits: () => { getRawValue: () => string[] };
    };
    changeHandler.onEndDateChange('2024-11-20');
    const values = changeHandler.endUnits().getRawValue();
    expect(values[0]).toBe('2024');
    expect(values[1]).toBe('11');
    expect(values[2]).toBe('20');
  });

  it('applyIsoDateTo ignores invalid date string', async () => {
    const { component } = await createComponent();
    const changeHandler = component as unknown as {
      onStartDateChange: (v: string) => void;
      startUnits: () => { getRawValue: () => string[] };
    };
    const before = changeHandler.startUnits().getRawValue();
    changeHandler.onStartDateChange('not-a-date');
    const after = changeHandler.startUnits().getRawValue();
    expect(after).toEqual(before);
  });

  // ─── endBeforeStart cross validator ────────────────────────────────────────

  it('marks form invalid when end is before start', async () => {
    const { component } = await createComponent();
    const form = (
      component as unknown as {
        form: {
          controls: {
            title: { setValue: (v: string) => void };
            trackId: { setValue: (v: string) => void };
            ranged: { setValue: (v: boolean) => void };
            startUnits: {
              controls: Array<{ setValue: (v: string) => void }>;
            };
            endUnits: { controls: Array<{ setValue: (v: string) => void }> };
          };
          updateValueAndValidity: () => void;
          hasError: (e: string) => boolean;
        };
      }
    ).form;
    form.controls.title.setValue('Test');
    form.controls.trackId.setValue('track-1');
    form.controls.ranged.setValue(true);
    form.controls.startUnits.controls[0].setValue('2025');
    form.controls.startUnits.controls[1].setValue('6');
    form.controls.startUnits.controls[2].setValue('1');
    form.controls.endUnits.controls[0].setValue('2020');
    form.controls.endUnits.controls[1].setValue('1');
    form.controls.endUnits.controls[2].setValue('1');
    form.updateValueAndValidity();
    expect(form.hasError('endBeforeStart')).toBe(true);
  });

  // ─── Dropdown input mode ───────────────────────────────────────────────────

  it('inputModeFor returns the unit mode from the system', async () => {
    const { component } = await createComponent();
    const mode = (
      component as unknown as {
        inputModeFor: (i: number) => 'numeric' | 'dropdown';
      }
    ).inputModeFor(0);
    // Gregorian system uses numeric for year
    expect(mode).toBe('numeric');
  });

  it('optionsFor returns dropdown options for a unit', async () => {
    const { component } = await createComponent();
    const opts = (
      component as unknown as {
        optionsFor: (i: number) => readonly { value: string; label: string }[];
      }
    ).optionsFor(1);
    // Gregorian month field has dropdown options (12 months)
    expect(opts.length).toBe(12);
  });

  // ─── Seed fallback path for different system ──────────────────────────────

  it('seeds units with zeros when event system differs from dialog system', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'e-diff',
        trackId: 'track-1',
        title: 'DiffSys',
        start: {
          systemId: 'other-system',
          units: ['100', '200', '300'],
        },
      },
    };
    const { component } = await createComponent(data);
    const startVals = (
      component as unknown as {
        startUnits: () => { getRawValue: () => string[] };
      }
    )
      .startUnits()
      .getRawValue();
    // Should be all '0' since system doesn't match
    expect(startVals.every(v => v === '0')).toBe(true);
  });

  // ─── Save with description & existing event metadata ──────────────────────

  it('preserves linkedElementId and color from existing event', async () => {
    const data: TimelineEventDialogData = {
      ...baseData,
      event: {
        id: 'meta-evt',
        trackId: 'track-1',
        title: 'Meta Event',
        start: { systemId: 'gregorian', units: ['2024', '6', '15'] },
        linkedElementId: 'elem-99',
        color: '#00ff00',
      },
    };
    const { component, closeSpy } = await createComponent(data);
    (component as unknown as { onSave: () => void }).onSave();
    expect(closeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'save',
        event: expect.objectContaining({
          linkedElementId: 'elem-99',
          color: '#00ff00',
        }),
      })
    );
  });

  it('saves event with trimmed description', async () => {
    const { component, closeSpy } = await createComponent();
    const form = (
      component as unknown as {
        form: {
          controls: {
            title: { setValue: (v: string) => void };
            trackId: { setValue: (v: string) => void };
            description: { setValue: (v: string) => void };
            startUnits: {
              controls: Array<{ setValue: (v: string) => void }>;
            };
          };
        };
      }
    ).form;
    form.controls.title.setValue('Desc Event');
    form.controls.trackId.setValue('track-1');
    form.controls.description.setValue('  Some description  ');
    form.controls.startUnits.controls[0].setValue('2024');
    form.controls.startUnits.controls[1].setValue('1');
    form.controls.startUnits.controls[2].setValue('1');
    (component as unknown as { onSave: () => void }).onSave();
    expect(closeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'save',
        event: expect.objectContaining({
          description: 'Some description',
        }),
      })
    );
  });
});
