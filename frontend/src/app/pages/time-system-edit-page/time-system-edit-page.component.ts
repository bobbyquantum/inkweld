import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
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
  template: `
    <div class="page">
      <header class="header">
        <button
          mat-icon-button
          matTooltip="Back to settings"
          (click)="onCancel()"
          data-testid="time-system-edit-back">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="title-block">
          <h1>
            {{ isEditMode() ? 'Edit time system' : 'Design a time system' }}
          </h1>
          <p class="hint">
            Define the calendar's units, display format, and per-value
            overrides. Click a unit to edit it.
          </p>
        </div>
      </header>

      @if (loadError()) {
        <div class="error" data-testid="time-system-edit-error">
          {{ loadError() }}
        </div>
      } @else {
        @if (!isEditMode()) {
          <div class="templates" data-testid="time-system-edit-templates">
            <div class="section-label">Start from a template</div>
            <div class="template-chips">
              @for (tpl of templates; track tpl.id) {
                <button
                  mat-stroked-button
                  type="button"
                  (click)="loadTemplate(tpl)"
                  [attr.data-testid]="'time-system-edit-template-' + tpl.id">
                  {{ tpl.name }}
                </button>
              }
            </div>
          </div>
        }

        <form [formGroup]="form" class="form" autocomplete="off">
          <mat-form-field appearance="outline">
            <mat-label>System name</mat-label>
            <input
              matInput
              formControlName="name"
              data-testid="time-system-edit-name" />
          </mat-form-field>

          <div class="section-label">
            Units (most significant → least significant)
          </div>

          @if (units().length === 0) {
            <div class="empty" data-testid="time-system-edit-units-empty">
              <mat-icon>schedule</mat-icon>
              <p>No units defined yet.</p>
              <p class="hint">
                Add at least one unit to describe the calendar.
              </p>
            </div>
          } @else {
            <div class="units-list" data-testid="time-system-edit-units-list">
              @for (unit of units(); track $index; let i = $index) {
                <div
                  class="unit-row"
                  [attr.data-testid]="'time-system-edit-unit-row-' + i">
                  <button
                    type="button"
                    class="unit-info"
                    (click)="onEditUnit(i)"
                    [attr.data-testid]="'time-system-edit-unit-info-' + i">
                    <div class="unit-name">
                      {{ i + 1 }}. {{ unit.name || '(unnamed)' }}
                    </div>
                    <div class="unit-meta">
                      {{ describeUnit(i, unit) }}
                    </div>
                  </button>
                  <div class="unit-actions">
                    <button
                      mat-icon-button
                      matTooltip="Move up"
                      [disabled]="i === 0"
                      (click)="onMoveUnit(i, -1)"
                      [attr.data-testid]="'time-system-edit-unit-up-' + i">
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      matTooltip="Move down"
                      [disabled]="i === units().length - 1"
                      (click)="onMoveUnit(i, 1)"
                      [attr.data-testid]="'time-system-edit-unit-down-' + i">
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      matTooltip="Edit unit"
                      (click)="onEditUnit(i)"
                      [attr.data-testid]="'time-system-edit-unit-edit-' + i">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      matTooltip="Remove unit"
                      [disabled]="units().length <= 1"
                      (click)="onRemoveUnit(i)"
                      [attr.data-testid]="'time-system-edit-unit-remove-' + i">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          }

          <button
            mat-stroked-button
            type="button"
            class="add-unit"
            (click)="onAddUnit()"
            data-testid="time-system-edit-add-unit">
            <mat-icon>add</mat-icon>
            Add unit
          </button>

          <mat-form-field appearance="outline">
            <mat-label>
              Display format (use {{ '{u0}' }}, {{ '{u1}' }}, … or
              {{ '{a0}' }} for override names)
            </mat-label>
            <input
              matInput
              formControlName="format"
              data-testid="time-system-edit-format" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Parse separator</mat-label>
            <input
              matInput
              maxlength="3"
              formControlName="parseSeparator"
              data-testid="time-system-edit-separator" />
          </mat-form-field>

          <div class="preview" data-testid="time-system-edit-preview">
            <span class="section-label">Preview:</span>
            <code>{{ previewText() }}</code>
          </div>
        </form>

        <footer class="footer">
          <button
            mat-button
            type="button"
            (click)="onCancel()"
            data-testid="time-system-edit-cancel">
            Cancel
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!canSave()"
            (click)="onSave()"
            data-testid="time-system-edit-save">
            {{ isEditMode() ? 'Save changes' : 'Create system' }}
          </button>
        </footer>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 760px;
        padding: 0;
        padding-bottom: 80px;
      }
      .page {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .header {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .title-block h1 {
        margin: 0 0 4px;
        font-size: 1.4rem;
      }
      .hint {
        color: var(--sys-on-surface-variant);
        font-size: 0.9rem;
        margin: 0;
      }
      .templates {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .template-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .section-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--sys-on-surface-variant);
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .units-list {
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .unit-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
      }
      .unit-row + .unit-row {
        border-top: 1px solid var(--sys-outline-variant);
      }
      .unit-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        cursor: pointer;
        background: transparent;
        border: none;
        padding: 0;
        text-align: left;
        font: inherit;
        color: inherit;
      }
      .unit-info:focus-visible {
        outline: 2px solid var(--sys-primary);
        outline-offset: 2px;
        border-radius: 4px;
      }
      .unit-name {
        font-weight: 500;
      }
      .unit-meta {
        color: var(--sys-on-surface-variant);
        font-size: 0.85rem;
      }
      .unit-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
      }
      .add-unit {
        align-self: flex-start;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 24px;
        border: 1px dashed var(--sys-outline-variant);
        border-radius: 8px;
        text-align: center;
      }
      .empty p {
        margin: 0;
      }
      .preview {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 8px;
        border-radius: 4px;
        background: var(--sys-surface-container);
      }
      code {
        font-family: monospace;
      }
      .footer {
        position: sticky;
        bottom: 0;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px;
        margin: 8px -16px 0;
        background: var(--sys-surface);
        border-top: 1px solid var(--sys-outline-variant);
        z-index: 2;
      }
      .error {
        padding: 12px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--sys-error) 10%, transparent);
        color: var(--sys-error);
      }
    `,
  ],
})
export class TimeSystemEditPageComponent {
  private readonly library = inject(TimeSystemLibraryService);
  private readonly dialog = inject(MatDialog);

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
    this.form.valueChanges.subscribe(() =>
      this.formTickSignal.update(n => n + 1)
    );

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
    this.form.reset({
      name: '',
      format: '{u0}-{u1}-{u2}',
      parseSeparator: '-',
    });
    this.units.set([
      {
        name: 'Year',
        subdivision: null,
        allowZero: false,
        inputMode: 'numeric',
        aliases: {},
        subdivisionOverrides: {},
      },
      {
        name: 'Month',
        subdivision: 12,
        allowZero: false,
        inputMode: 'numeric',
        aliases: {},
        subdivisionOverrides: {},
      },
      {
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
    const payload: Omit<TimeSystem, 'id' | 'isBuiltIn'> = {
      name: raw.name.trim(),
      unitLabels: list.map(u => u.name.trim()),
      subdivisions: list.slice(1).map(u => u.subdivision ?? 1),
      format: raw.format,
      parseSeparator: raw.parseSeparator,
      ...buildOptionalAliasArray(list),
      ...buildOptionalAllowZeroArray(list),
      ...buildOptionalInputModeArray(list),
      ...buildOptionalSubdivisionOverridesArray(list),
    };

    const id = this.systemId();
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

function systemToDrafts(system: TimeSystem): UnitDraft[] {
  return system.unitLabels.map((label, i) => ({
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
