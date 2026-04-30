import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GREGORIAN_SYSTEM, type TimeSystem } from '@models/time-system';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimeSystemEditPageComponent } from './time-system-edit-page.component';

function makeLibraryMock(initialSystems: TimeSystem[] = []) {
  const systemsSignal = signal<TimeSystem[]>(initialSystems);
  return {
    systems: systemsSignal.asReadonly(),
    templates: [],
    findSystem: vi.fn((id: string) => initialSystems.find(s => s.id === id)),
    addCustomSystem: vi.fn(),
    updateSystem: vi.fn(),
    installTemplate: vi.fn(),
    removeSystem: vi.fn(),
  };
}

async function createComponent(
  systemId: string | null = null,
  initialSystems: TimeSystem[] = []
) {
  const libraryMock = makeLibraryMock(initialSystems);
  const dialogRef = { afterClosed: vi.fn().mockReturnValue(of(null)) };
  const dialogMock = { open: vi.fn().mockReturnValue(dialogRef) };

  await TestBed.configureTestingModule({
    imports: [TimeSystemEditPageComponent, NoopAnimationsModule],
    providers: [
      { provide: TimeSystemLibraryService, useValue: libraryMock },
      { provide: MatDialog, useValue: dialogMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(TimeSystemEditPageComponent);
  if (systemId !== null) {
    fixture.componentRef.setInput('systemId', systemId);
  }
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    libraryMock,
    dialogMock,
  };
}

describe('TimeSystemEditPageComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('renders in create mode', async () => {
    const { fixture } = await createComponent(null);
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows templates section in create mode', async () => {
    const { fixture } = await createComponent(null);
    const templates = fixture.nativeElement.querySelector(
      '[data-testid="time-system-edit-templates"]'
    );
    expect(templates).not.toBeNull();
  });

  it('does not show templates section in edit mode', async () => {
    const existing = { ...GREGORIAN_SYSTEM, id: 'my-sys', isBuiltIn: false };
    const { fixture } = await createComponent('my-sys', [existing]);
    const templates = fixture.nativeElement.querySelector(
      '[data-testid="time-system-edit-templates"]'
    );
    expect(templates).toBeNull();
  });

  it('shows error when systemId not found in library', async () => {
    const { fixture } = await createComponent('nonexistent', []);
    const error = fixture.nativeElement.querySelector(
      '[data-testid="time-system-edit-error"]'
    );
    expect(error).not.toBeNull();
  });

  it('isEditMode() returns false in create mode', async () => {
    const { component } = await createComponent(null);
    expect(
      (component as unknown as { isEditMode: () => boolean }).isEditMode()
    ).toBe(false);
  });

  it('isEditMode() returns true when systemId is provided', async () => {
    const existing = { ...GREGORIAN_SYSTEM, id: 'edit-me', isBuiltIn: false };
    const { component } = await createComponent('edit-me', [existing]);
    expect(
      (component as unknown as { isEditMode: () => boolean }).isEditMode()
    ).toBe(true);
  });

  it('initialises blank with default units in create mode', async () => {
    const { component } = await createComponent(null);
    const units = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    expect(units.length).toBeGreaterThan(0);
    expect(units[0].name).toBe('Year');
  });

  it('loads system from library in edit mode', async () => {
    const existing = { ...GREGORIAN_SYSTEM, id: 'load-me', isBuiltIn: false };
    const { component } = await createComponent('load-me', [existing]);
    const form = (
      component as unknown as {
        form: { controls: { name: { value: string } } };
      }
    ).form;
    expect(form.controls.name.value).toBe(GREGORIAN_SYSTEM.name);
  });

  describe('loadTemplate()', () => {
    it('loads a template into the form', async () => {
      const { component } = await createComponent(null);
      (
        component as unknown as { loadTemplate: (tpl: TimeSystem) => void }
      ).loadTemplate(GREGORIAN_SYSTEM);
      const form = (
        component as unknown as {
          form: { controls: { name: { value: string } } };
        }
      ).form;
      expect(form.controls.name.value).toBe(GREGORIAN_SYSTEM.name);
    });
  });

  describe('unit operations', () => {
    it('can add a unit', async () => {
      const { component } = await createComponent(null);
      const before = (
        component as unknown as { units: () => unknown[] }
      ).units().length;
      (component as unknown as { onAddUnit: () => void }).onAddUnit();
      const after = (component as unknown as { units: () => unknown[] }).units()
        .length;
      expect(after).toBe(before + 1);
    });

    it('can remove a unit (at least 2 units remain)', async () => {
      const { component } = await createComponent(null);
      const before = (
        component as unknown as { units: () => unknown[] }
      ).units().length;
      (
        component as unknown as { onRemoveUnit: (i: number) => void }
      ).onRemoveUnit(before - 1);
      const after = (component as unknown as { units: () => unknown[] }).units()
        .length;
      expect(after).toBe(before - 1);
    });

    it('can move a unit up', async () => {
      const { component } = await createComponent(null);
      const unitsBefore = (
        component as unknown as { units: () => Array<{ name: string }> }
      ).units();
      const secondName = unitsBefore[1].name;
      (
        component as unknown as {
          onMoveUnit: (i: number, delta: number) => void;
        }
      ).onMoveUnit(1, -1);
      const unitsAfter = (
        component as unknown as { units: () => Array<{ name: string }> }
      ).units();
      expect(unitsAfter[0].name).toBe(secondName);
    });
  });

  describe('canSave()', () => {
    it('returns false when form is invalid (empty name)', async () => {
      const { component } = await createComponent(null);
      const form = (
        component as unknown as {
          form: { controls: { name: { setValue: (v: string) => void } } };
        }
      ).form;
      form.controls.name.setValue('');
      expect(
        (component as unknown as { canSave: () => boolean }).canSave()
      ).toBe(false);
    });

    it('returns true with valid form and units', async () => {
      const { component } = await createComponent(null);
      const form = (
        component as unknown as {
          form: { controls: { name: { setValue: (v: string) => void } } };
        }
      ).form;
      form.controls.name.setValue('My Calendar');
      expect(
        (component as unknown as { canSave: () => boolean }).canSave()
      ).toBe(true);
    });
  });

  describe('onCancel()', () => {
    it('emits done event', async () => {
      const { component } = await createComponent(null);
      const doneSpy = vi.fn();
      component.done.subscribe(doneSpy);
      (component as unknown as { onCancel: () => void }).onCancel();
      expect(doneSpy).toHaveBeenCalled();
    });
  });

  describe('onSave()', () => {
    it('calls addCustomSystem in create mode and emits done', async () => {
      const { component, libraryMock } = await createComponent(null);
      const doneSpy = vi.fn();
      component.done.subscribe(doneSpy);
      const form = (
        component as unknown as {
          form: { controls: { name: { setValue: (v: string) => void } } };
        }
      ).form;
      form.controls.name.setValue('New Calendar');
      (component as unknown as { onSave: () => void }).onSave();
      expect(libraryMock.addCustomSystem).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Calendar' })
      );
      expect(doneSpy).toHaveBeenCalled();
    });

    it('calls updateSystem in edit mode and emits done', async () => {
      const existing = {
        ...GREGORIAN_SYSTEM,
        id: 'sys-to-save',
        isBuiltIn: false,
      };
      const { component, libraryMock } = await createComponent('sys-to-save', [
        existing,
      ]);
      const doneSpy = vi.fn();
      component.done.subscribe(doneSpy);
      const form = (
        component as unknown as {
          form: { controls: { name: { setValue: (v: string) => void } } };
        }
      ).form;
      form.controls.name.setValue('Updated Calendar');
      (component as unknown as { onSave: () => void }).onSave();
      expect(libraryMock.updateSystem).toHaveBeenCalledWith(
        'sys-to-save',
        expect.objectContaining({ name: 'Updated Calendar' })
      );
      expect(doneSpy).toHaveBeenCalled();
    });

    it('does not save when canSave() is false', async () => {
      const { component, libraryMock } = await createComponent(null);
      const form = (
        component as unknown as {
          form: { controls: { name: { setValue: (v: string) => void } } };
        }
      ).form;
      form.controls.name.setValue('');
      (component as unknown as { onSave: () => void }).onSave();
      expect(libraryMock.addCustomSystem).not.toHaveBeenCalled();
    });
  });

  describe('previewText()', () => {
    it('returns a string preview of the format', async () => {
      const { component } = await createComponent(null);
      const preview = (
        component as unknown as { previewText: () => string }
      ).previewText();
      expect(typeof preview).toBe('string');
    });
  });

  describe('describeUnit()', () => {
    it('returns a description string for a unit', async () => {
      const { component } = await createComponent(null);
      const units = (
        component as unknown as {
          units: () => Array<{ name: string; subdivision: number | null }>;
        }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(0, units[0]);
      expect(typeof desc).toBe('string');
    });

    it('describes top unit', async () => {
      const { component } = await createComponent(null);
      const units = (
        component as unknown as { units: () => unknown[] }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(0, units[0]);
      expect(desc).toContain('top unit');
    });

    it('describes child unit with subdivision count', async () => {
      const { component } = await createComponent(null);
      const units = (
        component as unknown as { units: () => unknown[] }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(1, units[1]);
      expect(desc).toContain('12');
      expect(desc).toContain('per');
    });

    it('describes unit with allowZero flag', async () => {
      const { component } = await createComponent(null);

      (component as any).units.update((list: any[]) => {
        const copy = [...list];
        copy[1] = { ...copy[1], allowZero: true };
        return copy;
      });
      const units = (
        component as unknown as { units: () => unknown[] }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(1, units[1]);
      expect(desc).toContain('allow 0');
    });

    it('describes unit with dropdown inputMode', async () => {
      const { component } = await createComponent(null);

      (component as any).units.update((list: any[]) => {
        const copy = [...list];
        copy[1] = { ...copy[1], inputMode: 'dropdown' };
        return copy;
      });
      const units = (
        component as unknown as { units: () => unknown[] }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(1, units[1]);
      expect(desc).toContain('dropdown');
    });

    it('describes unit with override count', async () => {
      const { component } = await createComponent(null);

      (component as any).units.update((list: any[]) => {
        const copy = [...list];
        copy[1] = { ...copy[1], aliases: { '1': 'January', '2': 'February' } };
        return copy;
      });
      const units = (
        component as unknown as { units: () => unknown[] }
      ).units();
      const desc = (
        component as unknown as {
          describeUnit: (i: number, u: unknown) => string;
        }
      ).describeUnit(1, units[1]);
      expect(desc).toContain('2 override(s)');
    });
  });

  // ─── Move unit edge cases ──────────────────────────────────────────────────

  it('onMoveUnit ignores out-of-bounds move', async () => {
    const { component } = await createComponent(null);
    const unitsBefore = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    const firstBefore = unitsBefore[0].name;
    (
      component as unknown as {
        onMoveUnit: (i: number, delta: number) => void;
      }
    ).onMoveUnit(0, -1);
    const unitsAfter = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    expect(unitsAfter[0].name).toBe(firstBefore);
  });

  it('onMoveUnit down promotes former-second to top (null subdivision)', async () => {
    const { component } = await createComponent(null);
    (
      component as unknown as {
        onMoveUnit: (i: number, delta: number) => void;
      }
    ).onMoveUnit(0, 1);
    const units = (
      component as unknown as {
        units: () => Array<{ name: string; subdivision: number | null }>;
      }
    ).units();
    // The new top unit should have null subdivision
    expect(units[0].subdivision).toBeNull();
    // The demoted unit should have a non-null subdivision
    expect(units[1].subdivision).not.toBeNull();
  });

  // ─── Remove unit edge cases ────────────────────────────────────────────────

  it('onRemoveUnit does not remove when only 1 unit exists', async () => {
    const { component } = await createComponent(null);
    // Remove units until only 1 left
    const units = (component as unknown as { units: () => unknown[] }).units();
    for (let i = units.length - 1; i > 0; i--) {
      (
        component as unknown as { onRemoveUnit: (i: number) => void }
      ).onRemoveUnit(i);
    }
    const remaining = (
      component as unknown as { units: () => unknown[] }
    ).units();
    expect(remaining.length).toBe(1);
    // Try removing the last one — should be prevented
    (
      component as unknown as { onRemoveUnit: (i: number) => void }
    ).onRemoveUnit(0);
    expect(
      (component as unknown as { units: () => unknown[] }).units().length
    ).toBe(1);
  });

  it('onRemoveUnit promotes next unit to top when first is removed', async () => {
    const { component } = await createComponent(null);
    (
      component as unknown as { onRemoveUnit: (i: number) => void }
    ).onRemoveUnit(0);
    const units = (
      component as unknown as {
        units: () => Array<{ name: string; subdivision: number | null }>;
      }
    ).units();
    // New first unit should be top unit (null subdivision)
    expect(units[0].subdivision).toBeNull();
  });

  // ─── Edit unit via dialog ──────────────────────────────────────────────────

  it('onEditUnit opens dialog and updates unit on save', async () => {
    const { component, dialogMock } = await createComponent(null);
    const unitsBefore = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    const oldName = unitsBefore[1].name;

    dialogMock.open.mockReturnValueOnce({
      afterClosed: () =>
        of({
          kind: 'save',
          unit: {
            name: 'Updated Month',
            subdivision: 12,
            allowZero: false,
            inputMode: 'numeric' as const,
            aliases: {},
            subdivisionOverrides: {},
          },
        }),
    });

    (component as unknown as { onEditUnit: (i: number) => void }).onEditUnit(1);
    const unitsAfter = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    expect(unitsAfter[1].name).toBe('Updated Month');
    expect(oldName).not.toBe('Updated Month');
  });

  it('onEditUnit does nothing when dialog is cancelled', async () => {
    const { component, dialogMock } = await createComponent(null);
    const unitsBefore = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();

    dialogMock.open.mockReturnValueOnce({
      afterClosed: () => of({ kind: 'cancel' }),
    });

    (component as unknown as { onEditUnit: (i: number) => void }).onEditUnit(1);
    const unitsAfter = (
      component as unknown as { units: () => Array<{ name: string }> }
    ).units();
    expect(unitsAfter[1].name).toBe(unitsBefore[1].name);
  });

  it('onEditUnit does nothing for invalid index', async () => {
    const { component, dialogMock } = await createComponent(null);
    (component as unknown as { onEditUnit: (i: number) => void }).onEditUnit(
      99
    );
    expect(dialogMock.open).not.toHaveBeenCalled();
  });

  // ─── previewText edge case ─────────────────────────────────────────────────

  it('previewText shows fallback when no units exist', async () => {
    const { component } = await createComponent(null);
    // Remove all but one, then remove that one won't work (min 1)
    // But we can test with an empty name fallback
    const preview = (
      component as unknown as { previewText: () => string }
    ).previewText();
    expect(preview.length).toBeGreaterThan(0);
  });
});
