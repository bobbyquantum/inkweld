import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
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
  defaultEnd: { systemId: 'gregorian', units: ['2000', '12', '31'] },
};

async function createComponent(data: TimelineEraDialogData = baseData) {
  const closeSpy = vi.fn();
  await TestBed.configureTestingModule({
    imports: [TimelineEraDialogComponent, NoopAnimationsModule],
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
      form.controls.endUnits.controls[2].setValue('31');
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
      form.controls.endUnits.controls[2].setValue('31');
      form.updateValueAndValidity();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });
});
