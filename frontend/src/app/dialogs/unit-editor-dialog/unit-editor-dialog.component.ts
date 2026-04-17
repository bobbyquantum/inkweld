import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Per-unit editor dialog.
 *
 * Edits every property of a single time-system unit in one place: name,
 * subdivision (the count of this unit per its parent — only relevant when
 * this is not the top-most unit), allow-zero, input mode (numeric or
 * dropdown), and per-value overrides. An override pairs a numeric value of
 * this unit with a display name AND, optionally, a custom count of
 * sub-units (e.g. month value `2` overrides to `28` days). The hosting
 * time-system edit page passes the current values in `seed` and receives a
 * fully populated `unit` object back on save.
 */
export interface UnitEditorData {
  /** Sequential index of the unit being edited (0 = top-most). */
  readonly index: number;
  /**
   * Initial values. `subdivision` may be `null` to indicate the top unit;
   * the dialog hides the subdivision field in that case.
   */
  readonly seed: {
    readonly name: string;
    readonly subdivision: number | null;
    readonly allowZero: boolean;
    readonly inputMode: 'numeric' | 'dropdown';
    readonly aliases: Readonly<Record<string, string>>;
    readonly subdivisionOverrides: Readonly<Record<string, number>>;
  };
  /**
   * Display name of the parent unit. Used to phrase the subdivision label
   * (e.g. "Months per Year"). Omitted for the top unit.
   */
  readonly parentUnitName?: string;
  /**
   * Display name of the child unit (the unit one level smaller). Used to
   * label the per-row sub-unit override input. Omitted for the leaf unit.
   */
  readonly childUnitName?: string;
}

export type UnitEditorResult =
  | {
      kind: 'save';
      unit: {
        name: string;
        /** `null` only for the top unit. */
        subdivision: number | null;
        allowZero: boolean;
        inputMode: 'numeric' | 'dropdown';
        aliases: Record<string, string>;
        subdivisionOverrides: Record<string, number>;
      };
    }
  | { kind: 'cancel' };

interface OverrideRow {
  readonly id: number;
  value: string;
  alias: string;
  /** Sub-unit count for this value. Empty string → use system default. */
  subdivision: string;
}

@Component({
  selector: 'app-unit-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ seed.name ? 'Edit unit: ' + seed.name : 'New unit' }}
    </h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Name</mat-label>
        <input
          matInput
          [ngModel]="name()"
          (ngModelChange)="name.set($event)"
          data-testid="unit-editor-name"
          cdkFocusInitial />
      </mat-form-field>

      @if (!isTopUnit) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ subdivisionLabel() }}</mat-label>
          <input
            matInput
            type="number"
            min="1"
            step="1"
            [ngModel]="subdivision()"
            (ngModelChange)="subdivision.set($event)"
            data-testid="unit-editor-subdivision" />
        </mat-form-field>
      }

      <div class="flags-row">
        <mat-checkbox
          [(ngModel)]="allowZero"
          data-testid="unit-editor-allow-zero">
          Allow zero
        </mat-checkbox>
        <mat-form-field
          appearance="outline"
          class="input-mode"
          subscriptSizing="dynamic">
          <mat-label>Input</mat-label>
          <mat-select
            [(ngModel)]="inputMode"
            data-testid="unit-editor-input-mode">
            <mat-option value="numeric">Numeric</mat-option>
            <mat-option value="dropdown">Dropdown</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <mat-divider></mat-divider>

      <div class="aliases-header">
        <div class="section-label">Overrides</div>
        <p class="hint">
          Override how a specific value of this unit is named or how many
          sub-units it contains. Example: month <code>2</code> &rarr; name
          "February", sub-units <code>28</code>. Use
          <code>&#123;a&lt;i&gt;&#125;</code> in the system's display format to
          render the override name; <code>&#123;u&lt;i&gt;&#125;</code> still
          shows the raw number.
        </p>
      </div>

      <div class="rows">
        @for (row of rows(); track row.id; let idx = $index) {
          <div class="row">
            <mat-form-field
              appearance="outline"
              class="value"
              subscriptSizing="dynamic">
              <mat-label>Value</mat-label>
              <input
                matInput
                type="number"
                [(ngModel)]="row.value"
                (ngModelChange)="onValueChange(row.id, $event)"
                [attr.data-testid]="'unit-editor-override-value-' + idx" />
            </mat-form-field>
            <mat-form-field
              appearance="outline"
              class="alias"
              subscriptSizing="dynamic">
              <mat-label>Name</mat-label>
              <input
                matInput
                [(ngModel)]="row.alias"
                (ngModelChange)="onAliasChange(row.id, $event)"
                [attr.data-testid]="'unit-editor-override-name-' + idx" />
            </mat-form-field>
            @if (hasChildUnit) {
              <mat-form-field
                appearance="outline"
                class="sub"
                subscriptSizing="dynamic">
                <mat-label>{{ subdivisionOverrideLabel() }}</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  step="1"
                  [placeholder]="defaultSubdivisionPlaceholder"
                  [(ngModel)]="row.subdivision"
                  (ngModelChange)="onSubdivisionChange(row.id, $event)"
                  [attr.data-testid]="
                    'unit-editor-override-subdivision-' + idx
                  " />
              </mat-form-field>
            }
            <button
              mat-icon-button
              type="button"
              matTooltip="Remove override"
              (click)="removeRow(row.id)"
              [attr.data-testid]="'unit-editor-override-remove-' + idx">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        } @empty {
          <div class="empty">No overrides yet.</div>
        }
      </div>

      @if (duplicateKeys().length > 0) {
        <div class="warn" data-testid="unit-editor-duplicate-warning">
          Duplicate values: {{ duplicateKeys().join(', ') }}. Only the last
          entry for each value will be saved.
        </div>
      }

      <div class="actions-row">
        <button
          mat-stroked-button
          type="button"
          (click)="addRow()"
          data-testid="unit-editor-override-add">
          <mat-icon>add</mat-icon>
          Add override
        </button>
        @if (effectiveSuggestedCount() > 0) {
          <button
            mat-stroked-button
            type="button"
            (click)="fillRange()"
            [disabled]="fillDisabled()"
            matTooltip="Add a row for every value in this unit's range"
            data-testid="unit-editor-override-fill-range">
            <mat-icon>format_list_numbered</mat-icon>
            Fill 1–{{ effectiveSuggestedCount() }}
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" data-testid="unit-editor-cancel">
        Cancel
      </button>
      <button
        mat-button
        color="primary"
        [disabled]="!canSave()"
        (click)="onSave()"
        data-testid="unit-editor-save">
        Save unit
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        min-width: 480px;
        max-width: 600px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .flags-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .input-mode {
        width: 160px;
      }
      .aliases-header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .section-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--sys-on-surface-variant);
      }
      .hint {
        margin: 0;
        font-size: 12px;
        color: var(--sys-on-surface-variant);
        line-height: 1.4;
      }
      .hint code {
        font-family: monospace;
        padding: 0 3px;
        border-radius: 3px;
        background: var(--sys-surface-container-high);
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 40vh;
        overflow-y: auto;
      }
      .row {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .value {
        flex: 0 0 110px;
      }
      .alias {
        flex: 1 1 auto;
        min-width: 120px;
      }
      .sub {
        flex: 0 0 140px;
      }
      .empty {
        font-size: 12px;
        color: var(--sys-on-surface-variant);
        padding: 8px 0;
      }
      .warn {
        font-size: 12px;
        color: var(--sys-error);
        padding: 4px 8px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--sys-error) 10%, transparent);
      }
      .actions-row {
        display: flex;
        gap: 8px;
      }
    `,
  ],
})
export class UnitEditorDialogComponent {
  protected readonly data = inject<UnitEditorData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<UnitEditorDialogComponent, UnitEditorResult>>(
      MatDialogRef
    );

  protected readonly seed = this.data.seed;
  protected readonly isTopUnit = this.seed.subdivision === null;
  protected readonly hasChildUnit = !!this.data.childUnitName;
  protected readonly defaultSubdivisionPlaceholder = 'default';

  protected readonly name = signal(this.seed.name);
  protected readonly subdivision = signal<number | null>(this.seed.subdivision);
  protected allowZero = this.seed.allowZero;
  protected inputMode: 'numeric' | 'dropdown' = this.seed.inputMode;

  private nextId = 0;
  protected readonly rows = signal<OverrideRow[]>(this.initialRows());

  protected readonly duplicateKeys = computed(() => {
    const seen = new Map<string, number>();
    for (const row of this.rows()) {
      const key = row.value.trim();
      if (!key) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  });

  /**
   * Effective range for the "fill" helper. For non-top units the range is
   * driven by the live subdivision input (so editing the count immediately
   * updates the helper). The top unit is unbounded — no helper.
   */
  protected readonly effectiveSuggestedCount = computed(() => {
    if (this.isTopUnit) return 0;
    const n = Number(this.subdivision());
    return Number.isInteger(n) && n > 0 ? n : 0;
  });

  protected readonly fillDisabled = computed(() => {
    const count = this.effectiveSuggestedCount();
    if (count <= 0) return true;
    const existing = new Set(this.rows().map(r => r.value.trim()));
    for (let v = 1; v <= count; v++) {
      if (!existing.has(String(v))) return false;
    }
    return true;
  });

  protected readonly canSave = computed(() => {
    if (!this.name().trim()) return false;
    if (!this.isTopUnit) {
      const sub = Number(this.subdivision());
      if (!Number.isInteger(sub) || sub <= 0) return false;
    }
    return true;
  });

  protected subdivisionLabel(): string {
    const parent = this.data.parentUnitName?.trim() || 'parent';
    const child = this.name().trim() || 'units';
    return `${child}s per ${parent}`;
  }

  protected subdivisionOverrideLabel(): string {
    const child = this.data.childUnitName?.trim() || 'sub-units';
    return `${child} count`;
  }

  private initialRows(): OverrideRow[] {
    const keys = new Set<string>([
      ...Object.keys(this.seed.aliases),
      ...Object.keys(this.seed.subdivisionOverrides),
    ]);
    return [...keys]
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      })
      .map(value => {
        const sub = this.seed.subdivisionOverrides[value];
        return {
          id: this.nextId++,
          value,
          alias: this.seed.aliases[value] ?? '',
          subdivision: sub === undefined ? '' : String(sub),
        };
      });
  }

  protected addRow(): void {
    this.rows.update(rows => [
      ...rows,
      { id: this.nextId++, value: '', alias: '', subdivision: '' },
    ]);
  }

  protected removeRow(id: number): void {
    this.rows.update(rows => rows.filter(r => r.id !== id));
  }

  protected onValueChange(id: number, value: string | number | null): void {
    const normalized = value == null ? '' : String(value);
    this.rows.update(rows =>
      rows.map(r => (r.id === id ? { ...r, value: normalized } : r))
    );
  }

  protected onAliasChange(id: number, alias: string): void {
    this.rows.update(rows =>
      rows.map(r => (r.id === id ? { ...r, alias } : r))
    );
  }

  protected onSubdivisionChange(
    id: number,
    subdivision: string | number | null
  ): void {
    const normalized = subdivision == null ? '' : String(subdivision);
    this.rows.update(rows =>
      rows.map(r => (r.id === id ? { ...r, subdivision: normalized } : r))
    );
  }

  protected fillRange(): void {
    const count = this.effectiveSuggestedCount();
    if (count <= 0) return;
    this.rows.update(rows => {
      const existing = new Set(rows.map(r => r.value.trim()));
      const additions: OverrideRow[] = [];
      for (let v = 1; v <= count; v++) {
        const key = String(v);
        if (!existing.has(key)) {
          additions.push({
            id: this.nextId++,
            value: key,
            alias: '',
            subdivision: '',
          });
        }
      }
      return [...rows, ...additions];
    });
  }

  protected onCancel(): void {
    this.dialogRef.close({ kind: 'cancel' });
  }

  protected onSave(): void {
    if (!this.canSave()) return;
    const aliases: Record<string, string> = {};
    const subdivisionOverrides: Record<string, number> = {};
    for (const row of this.rows()) {
      const key = row.value.trim();
      if (!key) continue;
      const alias = row.alias.trim();
      if (alias) aliases[key] = alias;
      const subRaw = row.subdivision.trim();
      if (subRaw) {
        const sub = Number(subRaw);
        if (Number.isInteger(sub) && sub > 0) {
          subdivisionOverrides[key] = sub;
        }
      }
    }
    this.dialogRef.close({
      kind: 'save',
      unit: {
        name: this.name().trim(),
        subdivision: this.isTopUnit ? null : Number(this.subdivision()),
        allowZero: this.allowZero,
        inputMode: this.inputMode,
        aliases,
        subdivisionOverrides,
      },
    });
  }
}
