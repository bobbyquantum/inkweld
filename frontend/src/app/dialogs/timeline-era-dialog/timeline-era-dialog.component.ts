import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  type AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  isValidTimePointFor,
  type TimePoint,
  type TimeSystem,
  unitDropdownOptions,
  unitInputModeFor,
} from '@models/time-system';
import type { TimelineEra } from '@models/timeline.model';

export interface TimelineEraDialogData {
  /** Existing era for editing, or `null` to create a new one. */
  era: TimelineEra | null;
  system: TimeSystem;
  /** Seed range for new eras (shown as start/end defaults). */
  defaultStart?: TimePoint;
  defaultEnd?: TimePoint;
  defaultColor?: string;
}

export type TimelineEraDialogResult =
  | { kind: 'save'; era: TimelineEra }
  | { kind: 'delete'; eraId: string };

const INT_RE = /^-?\d+$/;

function integerValidator(control: AbstractControl): ValidationErrors | null {
  const v = String(control.value ?? '').trim();
  if (v.length === 0) return { required: true };
  return INT_RE.test(v) ? null : { integer: true };
}

@Component({
  selector: 'app-timeline-era-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.era ? 'Edit era' : 'Add era' }}
    </h2>
    <mat-dialog-content class="content">
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input
            matInput
            formControlName="name"
            data-testid="timeline-era-name"
            cdkFocusInitial />
        </mat-form-field>

        <div class="section-label">Start</div>
        @if (isGregorian()) {
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input
              matInput
              type="date"
              [value]="startDateValue()"
              (change)="onStartDateChange($event)"
              data-testid="timeline-era-start-date" />
          </mat-form-field>
        }
        <div class="units-row">
          <ng-container formArrayName="startUnits">
            @for (_ of startUnits().controls; let i = $index; track i) {
              @if (inputModeFor(i) === 'dropdown') {
                <mat-form-field appearance="outline" class="unit-field">
                  <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                  <mat-select
                    [formControlName]="i"
                    [attr.data-testid]="'timeline-era-start-unit-' + i">
                    @for (opt of optionsFor(i); track opt.value) {
                      <mat-option [value]="opt.value">{{
                        opt.label
                      }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline" class="unit-field">
                  <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                  <input
                    matInput
                    type="number"
                    step="1"
                    [formControlName]="i"
                    [attr.data-testid]="'timeline-era-start-unit-' + i" />
                </mat-form-field>
              }
            }
          </ng-container>
        </div>

        <div class="section-label">End</div>
        @if (isGregorian()) {
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input
              matInput
              type="date"
              [value]="endDateValue()"
              (change)="onEndDateChange($event)"
              data-testid="timeline-era-end-date" />
          </mat-form-field>
        }
        <div class="units-row">
          <ng-container formArrayName="endUnits">
            @for (_ of endUnits().controls; let i = $index; track i) {
              @if (inputModeFor(i) === 'dropdown') {
                <mat-form-field appearance="outline" class="unit-field">
                  <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                  <mat-select
                    [formControlName]="i"
                    [attr.data-testid]="'timeline-era-end-unit-' + i">
                    @for (opt of optionsFor(i); track opt.value) {
                      <mat-option [value]="opt.value">{{
                        opt.label
                      }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              } @else {
                <mat-form-field appearance="outline" class="unit-field">
                  <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                  <input
                    matInput
                    type="number"
                    step="1"
                    [formControlName]="i"
                    [attr.data-testid]="'timeline-era-end-unit-' + i" />
                </mat-form-field>
              }
            }
          </ng-container>
        </div>

        @if (form.hasError('endBeforeStart')) {
          <div class="field-error" data-testid="timeline-era-range-error">
            End must be at or after start
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>Color</mat-label>
          <input
            matInput
            formControlName="color"
            placeholder="e.g. var(--sys-tertiary-container) or #8b5cf6"
            data-testid="timeline-era-color" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.era) {
        <button
          mat-button
          color="warn"
          data-testid="timeline-era-delete"
          (click)="onDelete()">
          Delete
        </button>
      }
      <span class="spacer"></span>
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        data-testid="timeline-era-save"
        [disabled]="form.invalid"
        (click)="onSave()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .content {
        min-width: 420px;
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .section-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--sys-on-surface-variant);
        margin-top: 4px;
      }
      .units-row {
        display: flex;
        gap: 8px;
      }
      .unit-field {
        flex: 1 1 0;
        min-width: 0;
      }
      .field-error {
        color: var(--sys-error);
        font-size: 12px;
      }
      .spacer {
        flex: 1;
      }
    `,
  ],
})
export class TimelineEraDialogComponent {
  protected readonly data = inject<TimelineEraDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<TimelineEraDialogComponent, TimelineEraDialogResult>>(
      MatDialogRef
    );

  protected readonly isGregorian = computed(
    () => this.data.system.id === 'gregorian'
  );

  /** Resolved input mode for unit `i` (numeric or dropdown). */
  protected inputModeFor(i: number): 'numeric' | 'dropdown' {
    return unitInputModeFor(this.data.system, i);
  }

  /** Dropdown options for unit `i` (used only when input mode is dropdown). */
  protected optionsFor(
    i: number
  ): readonly { readonly value: string; readonly label: string }[] {
    return unitDropdownOptions(this.data.system, i);
  }

  protected readonly form: FormGroup<{
    name: FormControl<string>;
    startUnits: FormArray<FormControl<string>>;
    endUnits: FormArray<FormControl<string>>;
    color: FormControl<string>;
  }>;

  private readonly startDateSignal = signal('');
  private readonly endDateSignal = signal('');
  protected readonly startDateValue = this.startDateSignal.asReadonly();
  protected readonly endDateValue = this.endDateSignal.asReadonly();

  constructor() {
    const n = this.data.system.unitLabels.length;
    const seed = (point: TimePoint | undefined): string[] => {
      if (point?.systemId === this.data.system.id) {
        return point.units.slice(0, n).map(String);
      }
      return Array.from({ length: n }, () => '0');
    };
    const startSeed = seed(this.data.era?.start ?? this.data.defaultStart);
    const endSeed = seed(this.data.era?.end ?? this.data.defaultEnd);

    const buildUnitArray = (seeds: string[]): FormArray<FormControl<string>> =>
      new FormArray<FormControl<string>>(
        seeds.map(
          v =>
            new FormControl<string>(v, {
              nonNullable: true,
              validators: [integerValidator],
            })
        )
      );

    this.form = new FormGroup({
      name: new FormControl<string>(this.data.era?.name ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(1)],
      }),
      startUnits: buildUnitArray(startSeed),
      endUnits: buildUnitArray(endSeed),
      color: new FormControl<string>(
        this.data.era?.color ?? this.data.defaultColor ?? '',
        { nonNullable: true, validators: [Validators.required] }
      ),
    });

    this.form.addValidators(group => {
      const g = group as typeof this.form;
      const start = this.pointFromUnits(g.controls.startUnits.getRawValue());
      const end = this.pointFromUnits(g.controls.endUnits.getRawValue());
      if (!start || !end) return null;
      if (
        !isValidTimePointFor(start, this.data.system) ||
        !isValidTimePointFor(end, this.data.system)
      ) {
        return null;
      }
      return this.toAbsolute(end) < this.toAbsolute(start)
        ? { endBeforeStart: true }
        : null;
    });
    this.form.updateValueAndValidity();

    this.startDateSignal.set(this.unitsToIsoDate('start'));
    this.endDateSignal.set(this.unitsToIsoDate('end'));
  }

  protected startUnits(): FormArray<FormControl<string>> {
    return this.form.controls.startUnits;
  }
  protected endUnits(): FormArray<FormControl<string>> {
    return this.form.controls.endUnits;
  }

  protected onStartDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applyIsoDateTo(value, 'start');
    this.startDateSignal.set(value);
  }
  protected onEndDateChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applyIsoDateTo(value, 'end');
    this.endDateSignal.set(value);
  }

  private unitsToIsoDate(which: 'start' | 'end'): string {
    if (!this.isGregorian()) return '';
    const source =
      which === 'start'
        ? (this.data.era?.start ?? this.data.defaultStart)
        : (this.data.era?.end ?? this.data.defaultEnd);
    if (source?.units.length !== 3) return '';
    const [y, m, d] = source.units.map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      return '';
    }
    const yy = String(y).padStart(4, '0');
    const mm = String(Math.max(1, m)).padStart(2, '0');
    const dd = String(Math.max(1, d)).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  private applyIsoDateTo(iso: string, which: 'start' | 'end'): void {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return;
    const units = [m[1], String(Number(m[2])), String(Number(m[3]))];
    const arr = which === 'start' ? this.startUnits() : this.endUnits();
    units.forEach((val, i) => arr.at(i)?.setValue(val));
  }

  private pointFromUnits(units: string[]): TimePoint | null {
    if (units.some(u => !INT_RE.test(String(u).trim()))) return null;
    return {
      systemId: this.data.system.id,
      units: units.map(u => String(u).trim()),
    };
  }

  private toAbsolute(point: TimePoint): bigint {
    const system = this.data.system;
    const n = system.unitLabels.length;
    const weights: bigint[] = new Array<bigint>(n);
    weights[n - 1] = 1n;
    for (let i = n - 2; i >= 0; i--) {
      weights[i] = weights[i + 1] * BigInt(system.subdivisions[i]);
    }
    let total = 0n;
    for (let i = 0; i < n; i++) {
      total += BigInt(point.units[i]) * weights[i];
    }
    return total;
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }

  protected onDelete(): void {
    if (!this.data.era) return;
    this.dialogRef.close({ kind: 'delete', eraId: this.data.era.id });
  }

  protected onSave(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const start = this.pointFromUnits(raw.startUnits);
    const end = this.pointFromUnits(raw.endUnits);
    if (!start || !end) return;
    if (
      !isValidTimePointFor(start, this.data.system) ||
      !isValidTimePointFor(end, this.data.system)
    ) {
      return;
    }

    const era: TimelineEra = {
      id: this.data.era?.id ?? '',
      name: raw.name.trim(),
      start,
      end,
      color: raw.color.trim(),
    };

    this.dialogRef.close({ kind: 'save', era });
  }
}
