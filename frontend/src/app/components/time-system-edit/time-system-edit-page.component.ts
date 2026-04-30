import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  type UnitEditorData,
  UnitEditorDialogComponent,
  type UnitEditorResult,
} from '@dialogs/unit-editor-dialog/unit-editor-dialog.component';
import { TIME_SYSTEM_TEMPLATES, type TimeSystem } from '@models/time-system';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';

interface UnitDraft {
  /** Stable identity used for @for tracking. */
  _id: number;
  name: string;
  /** `null` only on the top unit. */
  subdivision: number | null;
  allowZero: boolean;
  inputMode: 'numeric' | 'dropdown';
  aliases: Record<string, string>;
  subdivisionOverrides: Record<string, number>;
}

/**
 * Inline editor for a {@link TimeSystem}.
 *
 * Rendered inside the time-systems settings section — NOT a routed page.
 * The parent passes an optional `systemId` input (omit for create mode)
 * and listens to the `done` output to switch back to the list view.
 *
 * All per-unit editing — name, subdivision, overrides, allow-zero,
 * input mode — happens in the {@link UnitEditorDialogComponent} popup.
 * This component owns the system-level fields (name, display format,
 * parse separator) and the unit add/remove/reorder controls.
 */
@Component({
  selector: 'app-time-system-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './time-system-edit-page.component.html',
  styleUrls: ['./time-system-edit-page.component.scss'],
})
export class TimeSystemEditPageComponent {
  private readonly library = inject(TimeSystemLibraryService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * System ID to edit. When absent the editor starts in "create" mode.
   * The parent sets this when the user clicks "edit" on a system row.
   */
  readonly systemId = input<string | null>(null);

  /** Emitted when the editor is done (saved or cancelled). */
  readonly done = output<void>();

  protected readonly templates: readonly TimeSystem[] = TIME_SYSTEM_TEMPLATES;

  protected readonly isEditMode = computed(() => this.systemId() !== null);
  protected readonly loadError = signal<string | null>(null);

  /** Local draft of the units list. Mutated through `onEditUnit` etc. */
  protected readonly units = signal<UnitDraft[]>([]);

  protected readonly form = new FormGroup({
    name: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(1)],
    }),
    format: new FormControl<string>('{u0}-{u1}-{u2}', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    parseSeparator: new FormControl<string>('-', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(3)],
    }),
  });

  // Driver tick so previewText recomputes on form changes.
  private readonly formTickSignal = signal(0);

  protected readonly previewText = computed(() => {
    this.formTickSignal();
    const list = this.units();
    if (list.length === 0) return '(define at least one unit)';
    const parts: string[] = [list[0].name || 'unit 1'];
    for (let i = 1; i < list.length; i++) {
      const sub = list[i].subdivision ?? '?';
      const name = list[i].name || `unit ${i + 1}`;
      parts.push(`${sub} × ${name}`);
    }
    return parts.join(' / ');
  });

  protected readonly canSave = computed(() => {
    this.formTickSignal();
    if (this.form.invalid) return false;
    if (!this.form.controls.name.value.trim()) return false;
    const list = this.units();
    if (list.length === 0) return false;
    return list.every(u => {
      if (!u.name.trim()) return false;
      if (u.subdivision !== null) {
        if (!Number.isInteger(u.subdivision) || u.subdivision <= 0) {
          return false;
        }
      }
      return true;
    });
  });

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formTickSignal.update(n => n + 1));

    // React to the systemId input to load or initialise.
    effect(() => {
      const id = this.systemId();
      if (id) {
        this.loadFromLibrary(id);
      } else {
        this.initialiseBlank();
      }
    });
  }

  // ─── State initialisation ─────────────────────────────────────────────

  private initialiseBlank(): void {
    this.loadError.set(null);
    this.form.reset({
      name: '',
      format: '{u0}-{u1}-{u2}',
      parseSeparator: '-',
    });
    this.units.set([
      {
        _id: nextUnitId(),
        name: 'Year',
        subdivision: null,
        allowZero: false,
        inputMode: 'numeric',
        aliases: {},
        subdivisionOverrides: {},
      },
      {
        _id: nextUnitId(),
        name: 'Month',
        subdivision: 12,
        allowZero: false,
        inputMode: 'numeric',
        aliases: {},
        subdivisionOverrides: {},
      },
      {
        _id: nextUnitId(),
        name: 'Day',
        subdivision: 30,
        allowZero: false,
        inputMode: 'numeric',
        aliases: {},
        subdivisionOverrides: {},
      },
    ]);
    this.formTickSignal.update(n => n + 1);
  }

  private loadFromLibrary(id: string): void {
    const system = this.library.findSystem(id);
    if (!system) {
      this.loadError.set(`Time system "${id}" was not found.`);
      return;
    }
    this.loadError.set(null);
    this.form.reset({
      name: system.name,
      format: system.format,
      parseSeparator: system.parseSeparator,
    });
    this.units.set(systemToDrafts(system));
    this.formTickSignal.update(n => n + 1);
  }

  protected loadTemplate(tpl: TimeSystem): void {
    this.form.reset({
      name: tpl.name,
      format: tpl.format,
      parseSeparator: tpl.parseSeparator,
    });
    this.units.set(systemToDrafts(tpl));
    this.formTickSignal.update(n => n + 1);
  }

  // ─── Unit list operations ─────────────────────────────────────────────

  protected describeUnit(i: number, unit: UnitDraft): string {
    const parts: string[] = [];
    if (unit.subdivision === null) {
      parts.push('top unit');
    } else {
      const parent = this.units()[i - 1]?.name?.trim() || 'parent';
      parts.push(`${unit.subdivision} per ${parent}`);
    }
    if (unit.allowZero) parts.push('allow 0');
    if (unit.inputMode === 'dropdown') parts.push('dropdown');
    const overrideKeys = new Set([
      ...Object.keys(unit.aliases),
      ...Object.keys(unit.subdivisionOverrides),
    ]);
    if (overrideKeys.size > 0) {
      parts.push(`${overrideKeys.size} override(s)`);
    }
    return parts.join(' · ');
  }

  protected onAddUnit(): void {
    const next: UnitDraft = {
      _id: nextUnitId(),
      name: '',
      subdivision: this.units().length === 0 ? null : 1,
      allowZero: false,
      inputMode: 'numeric',
      aliases: {},
      subdivisionOverrides: {},
    };
    this.units.update(list => [...list, next]);
    this.formTickSignal.update(n => n + 1);
    // Open the editor immediately so the user can fill in the new unit.
    this.onEditUnit(this.units().length - 1);
  }

  protected onRemoveUnit(i: number): void {
    if (this.units().length <= 1) return;
    this.units.update(list => {
      const next = list.filter((_, idx) => idx !== i);
      // The first surviving unit must be the top unit (no subdivision).
      if (next.length > 0) next[0] = { ...next[0], subdivision: null };
      return next;
    });
    this.formTickSignal.update(n => n + 1);
  }

  protected onMoveUnit(i: number, delta: number): void {
    const target = i + delta;
    const list = this.units();
    if (target < 0 || target >= list.length) return;
    this.units.update(curr => {
      const next = [...curr];
      [next[i], next[target]] = [next[target], next[i]];
      // Re-apply the "top unit has no subdivision" rule. The newly-promoted
      // top unit drops its subdivision; the demoted unit gets one if it
      // doesn't have one.
      if (next.length > 0) {
        next[0] = { ...next[0], subdivision: null };
      }
      for (let k = 1; k < next.length; k++) {
        if (next[k].subdivision === null) {
          next[k] = { ...next[k], subdivision: 1 };
        }
      }
      return next;
    });
    this.formTickSignal.update(n => n + 1);
  }

  protected onEditUnit(i: number): void {
    const list = this.units();
    const unit = list[i];
    if (!unit) return;
    const parentName =
      i > 0 ? list[i - 1].name?.trim() || undefined : undefined;
    const childName =
      i < list.length - 1 ? list[i + 1].name?.trim() || undefined : undefined;
    const ref = this.dialog.open<
      UnitEditorDialogComponent,
      UnitEditorData,
      UnitEditorResult
    >(UnitEditorDialogComponent, {
      data: {
        index: i,
        seed: {
          name: unit.name,
          subdivision: unit.subdivision,
          allowZero: unit.allowZero,
          inputMode: unit.inputMode,
          aliases: { ...unit.aliases },
          subdivisionOverrides: { ...unit.subdivisionOverrides },
        },
        parentUnitName: parentName,
        childUnitName: childName,
      },
    });
    ref.afterClosed().subscribe(result => {
      if (result?.kind !== 'save') return;
      this.units.update(curr => {
        const next = [...curr];
        next[i] = {
          _id: curr[i]._id,
          name: result.unit.name,
          // Top unit forced to null regardless of dialog input.
          subdivision: i === 0 ? null : (result.unit.subdivision ?? 1),
          allowZero: result.unit.allowZero,
          inputMode: result.unit.inputMode,
          aliases: result.unit.aliases,
          subdivisionOverrides: result.unit.subdivisionOverrides,
        };
        return next;
      });
      this.formTickSignal.update(n => n + 1);
    });
  }

  // ─── Save / cancel ────────────────────────────────────────────────────

  protected onCancel(): void {
    this.done.emit();
  }

  protected onSave(): void {
    if (!this.canSave()) return;
    const raw = this.form.getRawValue();
    const list = this.units();
    const id = this.systemId();
    const aliasesResult = buildOptionalAliasArray(list);
    const allowZeroResult = buildOptionalAllowZeroArray(list);
    const inputModeResult = buildOptionalInputModeArray(list);
    const subdivisionOverridesResult =
      buildOptionalSubdivisionOverridesArray(list);

    const payload: Omit<TimeSystem, 'id' | 'isBuiltIn'> = {
      name: raw.name.trim(),
      unitLabels: list.map(u => u.name.trim()),
      subdivisions: list.slice(1).map(u => u.subdivision ?? 1),
      format: raw.format,
      parseSeparator: raw.parseSeparator,
      ...(id
        ? {
            unitAliases:
              'unitAliases' in aliasesResult ? aliasesResult.unitAliases : [],
            unitAllowZero:
              'unitAllowZero' in allowZeroResult
                ? allowZeroResult.unitAllowZero
                : [],
            unitInputMode:
              'unitInputMode' in inputModeResult
                ? inputModeResult.unitInputMode
                : [],
            unitSubdivisionOverrides:
              'unitSubdivisionOverrides' in subdivisionOverridesResult
                ? subdivisionOverridesResult.unitSubdivisionOverrides
                : [],
          }
        : {
            ...aliasesResult,
            ...allowZeroResult,
            ...inputModeResult,
            ...subdivisionOverridesResult,
          }),
    };

    if (id) {
      this.library.updateSystem(id, payload);
    } else {
      this.library.addCustomSystem(payload);
    }
    this.done.emit();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers (file-private)
// ─────────────────────────────────────────────────────────────────────────

/** Monotonically-increasing counter for stable @for tracking of UnitDraft rows. */
let _unitIdCounter = 0;
function nextUnitId(): number {
  return ++_unitIdCounter;
}

function systemToDrafts(system: TimeSystem): UnitDraft[] {
  return system.unitLabels.map((label, i) => ({
    _id: nextUnitId(),
    name: label,
    subdivision: i === 0 ? null : (system.subdivisions[i - 1] ?? 1),
    allowZero: system.unitAllowZero?.[i] ?? false,
    inputMode: system.unitInputMode?.[i] ?? 'numeric',
    aliases: system.unitAliases?.[i] ? { ...system.unitAliases[i] } : {},
    subdivisionOverrides: system.unitSubdivisionOverrides?.[i]
      ? { ...system.unitSubdivisionOverrides[i] }
      : {},
  }));
}

function buildOptionalAliasArray(
  list: readonly UnitDraft[]
): Pick<TimeSystem, 'unitAliases'> | Record<string, never> {
  let hasAny = false;
  const out: (Record<string, string> | undefined)[] = list.map(u => {
    if (Object.keys(u.aliases).length === 0) return undefined;
    hasAny = true;
    return { ...u.aliases };
  });
  return hasAny ? { unitAliases: out } : {};
}

function buildOptionalAllowZeroArray(
  list: readonly UnitDraft[]
): Pick<TimeSystem, 'unitAllowZero'> | Record<string, never> {
  let hasAny = false;
  const out = list.map(u => {
    if (u.allowZero) hasAny = true;
    return u.allowZero;
  });
  return hasAny ? { unitAllowZero: out } : {};
}

function buildOptionalInputModeArray(
  list: readonly UnitDraft[]
): Pick<TimeSystem, 'unitInputMode'> | Record<string, never> {
  let hasAny = false;
  const out: ('numeric' | 'dropdown')[] = list.map(u => {
    if (u.inputMode !== 'numeric') hasAny = true;
    return u.inputMode;
  });
  return hasAny ? { unitInputMode: out } : {};
}

function buildOptionalSubdivisionOverridesArray(
  list: readonly UnitDraft[]
): Pick<TimeSystem, 'unitSubdivisionOverrides'> | Record<string, never> {
  let hasAny = false;
  const out: (Record<string, number> | undefined)[] = list.map(u => {
    if (Object.keys(u.subdivisionOverrides).length === 0) return undefined;
    hasAny = true;
    return { ...u.subdivisionOverrides };
  });
  return hasAny ? { unitSubdivisionOverrides: out } : {};
}
