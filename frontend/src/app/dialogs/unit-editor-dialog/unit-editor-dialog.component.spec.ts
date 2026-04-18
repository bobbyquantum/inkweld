import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type UnitEditorData,
  UnitEditorDialogComponent,
} from './unit-editor-dialog.component';

const makeSeed = (
  overrides: Partial<UnitEditorData['seed']> = {}
): UnitEditorData['seed'] => ({
  name: 'Month',
  subdivision: 12,
  allowZero: false,
  inputMode: 'numeric',
  aliases: {},
  subdivisionOverrides: {},
  ...overrides,
});

const makeData = (overrides: Partial<UnitEditorData> = {}): UnitEditorData => ({
  index: 1,
  seed: makeSeed(),
  parentUnitName: 'Year',
  childUnitName: 'Day',
  ...overrides,
});

async function createComponent(data: UnitEditorData = makeData()) {
  const closeSpy = vi.fn();
  await TestBed.configureTestingModule({
    imports: [UnitEditorDialogComponent, NoopAnimationsModule],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: closeSpy } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(UnitEditorDialogComponent);
  fixture.detectChanges();
  return { fixture, closeSpy, component: fixture.componentInstance };
}

describe('UnitEditorDialogComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders without errors', async () => {
    const { fixture } = await createComponent();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows subdivision field for non-top unit', async () => {
    const { fixture } = await createComponent();
    const sub = fixture.nativeElement.querySelector(
      '[data-testid="unit-editor-subdivision"]'
    );
    expect(sub).not.toBeNull();
  });

  it('hides subdivision field for the top unit', async () => {
    const data = makeData({ seed: makeSeed({ subdivision: null }) });
    const { fixture } = await createComponent(data);
    const sub = fixture.nativeElement.querySelector(
      '[data-testid="unit-editor-subdivision"]'
    );
    expect(sub).toBeNull();
  });

  describe('canSave()', () => {
    it('returns true with valid name and subdivision', async () => {
      const { component } = await createComponent();
      expect(
        (component as unknown as { canSave: () => boolean }).canSave()
      ).toBe(true);
    });

    it('returns false when name is empty', async () => {
      const data = makeData({ seed: makeSeed({ name: '' }) });
      const { component } = await createComponent(data);
      expect(
        (component as unknown as { canSave: () => boolean }).canSave()
      ).toBe(false);
    });

    it('returns false when subdivision is not a positive integer', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: 0 }) });
      const { component } = await createComponent(data);
      expect(
        (component as unknown as { canSave: () => boolean }).canSave()
      ).toBe(false);
    });
  });

  describe('effectiveSuggestedCount()', () => {
    it('returns the subdivision value', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: 7 }) });
      const { component } = await createComponent(data);
      const count = (
        component as unknown as { effectiveSuggestedCount: () => number }
      ).effectiveSuggestedCount();
      expect(count).toBe(7);
    });

    it('returns 0 for top unit', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: null }) });
      const { component } = await createComponent(data);
      const count = (
        component as unknown as { effectiveSuggestedCount: () => number }
      ).effectiveSuggestedCount();
      expect(count).toBe(0);
    });
  });

  describe('onCancel()', () => {
    it('closes the dialog with cancel', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onCancel: () => void }).onCancel();
      expect(closeSpy).toHaveBeenCalledWith({ kind: 'cancel' });
    });
  });

  describe('onSave()', () => {
    it('closes the dialog with the unit on save', async () => {
      const { component, closeSpy } = await createComponent();
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'save' })
      );
    });

    it('does not close when canSave() is false', async () => {
      const data = makeData({ seed: makeSeed({ name: '' }) });
      const { component, closeSpy } = await createComponent(data);
      (component as unknown as { onSave: () => void }).onSave();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });

  describe('override rows', () => {
    it('loads existing aliases as rows', async () => {
      const data = makeData({
        seed: makeSeed({
          aliases: { '1': 'January' },
          subdivisionOverrides: {},
        }),
      });
      const { component } = await createComponent(data);
      const rows = (
        component as unknown as { rows: { (): { value: string }[] } }
      ).rows();
      expect(rows.some(r => r.value === '1')).toBe(true);
    });

    it('can add a new row', async () => {
      const { component } = await createComponent();
      const before = (
        component as unknown as { rows: { (): unknown[] } }
      ).rows().length;
      (component as unknown as { addRow: () => void }).addRow();
      const after = (component as unknown as { rows: { (): unknown[] } }).rows()
        .length;
      expect(after).toBe(before + 1);
    });

    it('can remove a row', async () => {
      const { component } = await createComponent();
      (component as unknown as { addRow: () => void }).addRow();
      const rows = (
        component as unknown as { rows: { (): { id: number }[] } }
      ).rows();
      const idToRemove = rows[0].id;
      (component as unknown as { removeRow: (id: number) => void }).removeRow(
        idToRemove
      );
      const after = (
        component as unknown as { rows: { (): { id: number }[] } }
      ).rows();
      expect(after.find(r => r.id === idToRemove)).toBeUndefined();
    });

    it('handles null value from number input gracefully', async () => {
      const { component } = await createComponent();
      (component as unknown as { addRow: () => void }).addRow();
      const rows = (
        component as unknown as { rows: { (): { id: number }[] } }
      ).rows();
      const id = rows[0].id;
      (
        component as unknown as {
          onValueChange: (id: number, v: string | number | null) => void;
        }
      ).onValueChange(id, null);
      const updated = (
        component as unknown as {
          rows: { (): { id: number; value: string }[] };
        }
      )
        .rows()
        .find(r => r.id === id);
      expect(updated?.value).toBe('');
    });

    it('handles null subdivision from number input gracefully', async () => {
      const { component } = await createComponent();
      (component as unknown as { addRow: () => void }).addRow();
      const rows = (
        component as unknown as { rows: { (): { id: number }[] } }
      ).rows();
      const id = rows[0].id;
      (
        component as unknown as {
          onSubdivisionChange: (id: number, v: string | number | null) => void;
        }
      ).onSubdivisionChange(id, null);
      const updated = (
        component as unknown as {
          rows: { (): { id: number; subdivision: string }[] };
        }
      )
        .rows()
        .find(r => r.id === id);
      expect(updated?.subdivision).toBe('');
    });
  });

  // ─── fillRange ──────────────────────────────────────────────────────────────

  describe('fillRange()', () => {
    it('adds missing rows up to the subdivision count', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: 4 }) });
      const { component } = await createComponent(data);
      (component as unknown as { fillRange: () => void }).fillRange();
      const rows = (
        component as unknown as {
          rows: { (): { value: string }[] };
        }
      ).rows();
      const values = rows.map(r => r.value);
      expect(values).toContain('1');
      expect(values).toContain('2');
      expect(values).toContain('3');
      expect(values).toContain('4');
    });

    it('does not duplicate already-existing row values', async () => {
      const data = makeData({
        seed: makeSeed({
          subdivision: 3,
          aliases: { '2': 'Two' },
        }),
      });
      const { component } = await createComponent(data);
      (component as unknown as { fillRange: () => void }).fillRange();
      const rows = (
        component as unknown as {
          rows: { (): { value: string }[] };
        }
      ).rows();
      const twos = rows.filter(r => r.value === '2');
      expect(twos.length).toBe(1);
    });

    it('does nothing for top unit', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: null }) });
      const { component } = await createComponent(data);
      (component as unknown as { fillRange: () => void }).fillRange();
      const rows = (component as unknown as { rows: { (): unknown[] } }).rows();
      expect(rows.length).toBe(0);
    });
  });

  // ─── fillDisabled ──────────────────────────────────────────────────────────

  describe('fillDisabled()', () => {
    it('returns true when all values already exist', async () => {
      const data = makeData({
        seed: makeSeed({
          subdivision: 2,
          aliases: { '1': 'A', '2': 'B' },
        }),
      });
      const { component } = await createComponent(data);
      expect(
        (component as unknown as { fillDisabled: () => boolean }).fillDisabled()
      ).toBe(true);
    });

    it('returns false when some values are missing', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: 3 }) });
      const { component } = await createComponent(data);
      expect(
        (component as unknown as { fillDisabled: () => boolean }).fillDisabled()
      ).toBe(false);
    });

    it('returns true for top unit', async () => {
      const data = makeData({ seed: makeSeed({ subdivision: null }) });
      const { component } = await createComponent(data);
      expect(
        (component as unknown as { fillDisabled: () => boolean }).fillDisabled()
      ).toBe(true);
    });
  });

  // ─── duplicateKeys ─────────────────────────────────────────────────────────

  describe('duplicateKeys()', () => {
    it('returns empty when no duplicates', async () => {
      const { component } = await createComponent();
      expect(
        (
          component as unknown as { duplicateKeys: () => string[] }
        ).duplicateKeys()
      ).toEqual([]);
    });

    it('detects duplicate row values', async () => {
      const { component } = await createComponent();
      const c = component as unknown as {
        addRow: () => void;
        rows: () => { id: number }[];
        onValueChange: (id: number, v: string) => void;
        duplicateKeys: () => string[];
      };
      c.addRow();
      c.addRow();
      const rows = c.rows();
      c.onValueChange(rows[0].id, '5');
      c.onValueChange(rows[1].id, '5');
      expect(c.duplicateKeys()).toContain('5');
    });
  });

  // ─── onAliasChange ─────────────────────────────────────────────────────────

  it('onAliasChange updates the alias of a row', async () => {
    const { component } = await createComponent();
    const c = component as unknown as {
      addRow: () => void;
      rows: () => { id: number; alias: string }[];
      onAliasChange: (id: number, alias: string) => void;
    };
    c.addRow();
    const id = c.rows()[0].id;
    c.onAliasChange(id, 'January');
    expect(c.rows().find(r => r.id === id)?.alias).toBe('January');
  });

  // ─── subdivisionLabel / subdivisionOverrideLabel ──────────────────────────

  it('subdivisionLabel returns formatted label', async () => {
    const { component } = await createComponent();
    const label = (
      component as unknown as { subdivisionLabel: () => string }
    ).subdivisionLabel();
    expect(label).toBe('Months per Year');
  });

  it('subdivisionOverrideLabel returns formatted child label', async () => {
    const { component } = await createComponent();
    const label = (
      component as unknown as { subdivisionOverrideLabel: () => string }
    ).subdivisionOverrideLabel();
    expect(label).toBe('Day count');
  });

  it('subdivisionLabel uses fallbacks when names are empty', async () => {
    const data = makeData({
      seed: makeSeed({ name: '' }),
      parentUnitName: '',
    });
    const { component } = await createComponent(data);
    const label = (
      component as unknown as { subdivisionLabel: () => string }
    ).subdivisionLabel();
    expect(label).toBe('unitss per parent');
  });

  it('subdivisionOverrideLabel uses fallback when childUnitName is missing', async () => {
    const data = makeData({ childUnitName: undefined });
    const { component } = await createComponent(data);
    const label = (
      component as unknown as { subdivisionOverrideLabel: () => string }
    ).subdivisionOverrideLabel();
    expect(label).toBe('sub-units count');
  });

  // ─── onSave with aliases and subdivisionOverrides ─────────────────────────

  it('onSave includes aliases and subdivisionOverrides from rows', async () => {
    const data = makeData({
      seed: makeSeed({
        subdivision: 12,
        aliases: { '1': 'January' },
        subdivisionOverrides: { '2': 28 },
      }),
    });
    const { component, closeSpy } = await createComponent(data);
    (component as unknown as { onSave: () => void }).onSave();
    const result = closeSpy.mock.calls[0][0];
    expect(result.kind).toBe('save');
    expect(result.unit.aliases['1']).toBe('January');
    expect(result.unit.subdivisionOverrides['2']).toBe(28);
  });

  // ─── initialRows with subdivisionOverrides ─────────────────────────────────

  it('initialRows loads subdivisionOverrides', async () => {
    const data = makeData({
      seed: makeSeed({
        aliases: {},
        subdivisionOverrides: { '2': 28, '4': 30 },
      }),
    });
    const { component } = await createComponent(data);
    const rows = (
      component as unknown as {
        rows: () => { value: string; subdivision: string }[];
      }
    ).rows();
    expect(rows.length).toBe(2);
    expect(rows.find(r => r.value === '2')?.subdivision).toBe('28');
    expect(rows.find(r => r.value === '4')?.subdivision).toBe('30');
  });
});
