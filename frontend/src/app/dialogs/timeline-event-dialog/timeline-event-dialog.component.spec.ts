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
});
