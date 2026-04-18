import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GREGORIAN_SYSTEM, RELATIVE_YEARS_SYSTEM } from '@models/time-system';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TimelineEraDialogComponent,
  type TimelineEraDialogData,
} from './timeline-era-dialog.component';

const baseData: TimelineEraDialogData = {
  era: null,
  system: GREGORIAN_SYSTEM,
  defaultColor: '#3f88c5',
  defaultStart: { systemId: 'gregorian', units: ['2000', '1', '1'] },
  defaultEnd: { systemId: 'gregorian', units: ['2000', '12', '30'] },
};

async function createComponent(data: TimelineEraDialogData = baseData) {
  const closeSpy = vi.fn();
  await TestBed.configureTestingModule({
    imports: [TimelineEraDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: closeSpy } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TimelineEraDialogComponent);
  fixture.detectChanges();
  return { fixture, closeSpy, component: fixture.componentInstance };
}

describe('TimelineEraDialogComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders for creating a new era', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders for editing an existing era', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-1',
        name: 'The Dark Ages',
        color: '#333',
        start: { systemId: 'gregorian', units: ['500', '1', '1'] },
        end: { systemId: 'gregorian', units: ['1000', '12', '31'] },
      },
    };
    const { fixture } = await createComponent(data);
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('seeds form values from the existing era', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-2',
        name: 'Renaissance',
        color: '#c9b458',
        start: { systemId: 'gregorian', units: ['1300', '1', '1'] },
        end: { systemId: 'gregorian', units: ['1600', '12', '31'] },
      },
    };
    const { component } = await createComponent(data);
    const form = (
      component as unknown as {
        form: { value: { name: string; color: string } };
      }
    ).form;
    expect(form.value.name).toBe('Renaissance');
    expect(form.value.color).toBe('#c9b458');
  });

  it('isGregorian() returns true for gregorian system', async () => {
    const { component } = await createComponent();
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(true);
  });

  it('isGregorian() returns false for relative years system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      system: RELATIVE_YEARS_SYSTEM,
    };
    const { component } = await createComponent(data);
    expect(
      (component as unknown as { isGregorian: () => boolean }).isGregorian()
    ).toBe(false);
  });

  describe('onCancel()', () => {
    it('closes the dialog without value', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onCancel: () => void }).onCancel();
      expect(closeSpy).toHaveBeenCalledWith();
    });
  });

  describe('onDelete()', () => {
    it('closes with delete result for an existing era', async () => {
      const data: TimelineEraDialogData = {
        ...baseData,
        era: {
          id: 'del-era',
          name: 'Deleted Era',
          color: '#fff',
          start: { systemId: 'gregorian', units: ['100', '1', '1'] },
          end: { systemId: 'gregorian', units: ['200', '12', '31'] },
        },
      };
      const { component, closeSpy } = await createComponent(data);
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).toHaveBeenCalledWith({
        kind: 'delete',
        eraId: 'del-era',
      });
    });

    it('does nothing when there is no era (new mode)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onDelete: () => void }).onDelete();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('onSave()', () => {
    it('does not save when form is invalid (empty name)', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('saves a valid era', async () => {
      const { component, closeSpy } = await createComponent();
      const form = (
        component as unknown as {
          form: {
            controls: {
              name: { setValue: (v: string) => void };
              color: { setValue: (v: string) => void };
              startUnits: {
                controls: Array<{ setValue: (v: string) => void }>;
              };
              endUnits: { controls: Array<{ setValue: (v: string) => void }> };
            };
          };
        }
      ).form;
      form.controls.name.setValue('New Era');
      form.controls.color.setValue('#aabbcc');
      form.controls.startUnits.controls[0].setValue('2000');
      form.controls.startUnits.controls[1].setValue('1');
      form.controls.startUnits.controls[2].setValue('1');
      form.controls.endUnits.controls[0].setValue('2010');
      form.controls.endUnits.controls[1].setValue('12');
      form.controls.endUnits.controls[2].setValue('30');
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'save' })
      );
    });

    it('does not save when end is before start', async () => {
      const { component, closeSpy } = await createComponent();
      const form = (
        component as unknown as {
          form: {
            controls: {
              name: { setValue: (v: string) => void };
              color: { setValue: (v: string) => void };
              startUnits: {
                controls: Array<{ setValue: (v: string) => void }>;
              };
              endUnits: { controls: Array<{ setValue: (v: string) => void }> };
            };
            updateValueAndValidity: () => void;
          };
        }
      ).form;
      form.controls.name.setValue('Reversed Era');
      form.controls.color.setValue('#aabbcc');
      form.controls.startUnits.controls[0].setValue('2010');
      form.controls.startUnits.controls[1].setValue('1');
      form.controls.startUnits.controls[2].setValue('1');
      form.controls.endUnits.controls[0].setValue('2000');
      form.controls.endUnits.controls[1].setValue('12');
      form.controls.endUnits.controls[2].setValue('30');
      form.updateValueAndValidity();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Date change handlers ──────────────────────────────────────────────────

  it('onStartDateChange updates start units from Event', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onStartDateChange: (e: Event) => void;
      startUnits: () => { getRawValue: () => string[] };
    };
    const fakeEvent = { target: { value: '2023-04-15' } } as unknown as Event;
    c.onStartDateChange(fakeEvent);
    const values = c.startUnits().getRawValue();
    expect(values[0]).toBe('2023');
    expect(values[1]).toBe('4');
    expect(values[2]).toBe('15');
  });

  it('onEndDateChange updates end units from Event', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onEndDateChange: (e: Event) => void;
      endUnits: () => { getRawValue: () => string[] };
    };
    const fakeEvent = { target: { value: '2024-11-20' } } as unknown as Event;
    c.onEndDateChange(fakeEvent);
    const values = c.endUnits().getRawValue();
    expect(values[0]).toBe('2024');
    expect(values[1]).toBe('11');
    expect(values[2]).toBe('20');
  });

  it('ignores invalid ISO date strings', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      onStartDateChange: (e: Event) => void;
      startUnits: () => { getRawValue: () => string[] };
    };
    const before = c.startUnits().getRawValue();
    const fakeEvent = { target: { value: 'invalid' } } as unknown as Event;
    c.onStartDateChange(fakeEvent);
    const after = c.startUnits().getRawValue();
    expect(after).toEqual(before);
  });

  // ─── Dropdown input mode ───────────────────────────────────────────────────

  it('inputModeFor returns the unit mode from the system', async () => {
    const { component } = await createComponent();
    const mode = (
      component as unknown as {
        inputModeFor: (i: number) => 'numeric' | 'dropdown';
      }
    ).inputModeFor(0);
    expect(mode).toBe('numeric');
  });

  it('optionsFor returns dropdown options for month unit', async () => {
    const { component } = await createComponent();
    const opts = (
      component as unknown as {
        optionsFor: (i: number) => readonly { value: string; label: string }[];
      }
    ).optionsFor(1);
    expect(opts.length).toBe(12);
  });

  // ─── Seed fallback for different system ────────────────────────────────────

  it('seeds units with per-unit minimums when era system differs from dialog system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      era: {
        id: 'era-diff',
        name: 'Different',
        color: '#000',
        start: { systemId: 'other-system', units: ['100', '200', '300'] },
        end: { systemId: 'other-system', units: ['400', '500', '600'] },
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
    expect(startVals).toEqual(['1', '1', '1']);
  });

  // ─── Start / end units accessors ──────────────────────────────────────────

  it('startUnits returns the form start units array', async () => {
    const { component } = await createComponent();
    const startUnits = (
      component as unknown as {
        startUnits: () => { getRawValue: () => string[] };
      }
    ).startUnits();
    expect(startUnits.getRawValue().length).toBe(3);
    expect(startUnits.getRawValue()[0]).toBe('2000');
  });

  it('endUnits returns the form end units array', async () => {
    const { component } = await createComponent();
    const endUnits = (
      component as unknown as {
        endUnits: () => { getRawValue: () => string[] };
      }
    ).endUnits();
    expect(endUnits.getRawValue().length).toBe(3);
    expect(endUnits.getRawValue()[0]).toBe('2000');
  });

  // ─── Non-Gregorian rendering ────────────────────────────────────────────────

  it('renders unit fields for non-Gregorian system', async () => {
    const data: TimelineEraDialogData = {
      ...baseData,
      system: RELATIVE_YEARS_SYSTEM,
      defaultStart: { systemId: RELATIVE_YEARS_SYSTEM.id, units: ['0'] },
      defaultEnd: { systemId: RELATIVE_YEARS_SYSTEM.id, units: ['100'] },
    };
    const { fixture } = await createComponent(data);
    const unitFields = fixture.nativeElement.querySelectorAll(
      '[data-testid^="timeline-era-start-unit-"]'
    );
    expect(unitFields.length).toBeGreaterThanOrEqual(1);
  });
});
