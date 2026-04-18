import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import type { TimelineEvent, TimelineTrack } from '@models/timeline.model';

export interface TimelineEventDialogData {
  /** Existing event for editing, or `null` to create a new one. */
  event: TimelineEvent | null;
  tracks: TimelineTrack[];
  system: TimeSystem;
  /** Prefilled track id for new events. */
  defaultTrackId?: string;
}

export type TimelineEventDialogResult =
  | { kind: 'save'; event: TimelineEvent }
  | { kind: 'delete'; eventId: string };

const INT_RE = /^-?\d+$/;

function integerValidator(control: AbstractControl): ValidationErrors | null {
  const v = String(control.value ?? '').trim();
  if (v.length === 0) return { required: true };
  return INT_RE.test(v) ? null : { integer: true };
}

@Component({
  selector: 'app-timeline-event-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.event ? 'Edit event' : 'Add event' }}
    </h2>
    <mat-dialog-content class="content">
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Title</mat-label>
          <input
            matInput
            formControlName="title"
            data-testid="timeline-event-title"
            cdkFocusInitial />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Track</mat-label>
          <mat-select
            formControlName="trackId"
            data-testid="timeline-event-track">
            @for (track of data.tracks; track track.id) {
              <mat-option
                [value]="track.id"
                [attr.data-testid]="'timeline-track-option-' + track.id">
                {{ track.name }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="section-label">Start</div>

        @if (isGregorian()) {
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input
              matInput
              type="date"
              [value]="startDateValue()"
              (change)="onStartDateChange($any($event.target).value)"
              data-testid="timeline-event-start-date" />
          </mat-form-field>
        }

        <div class="units-row" [formGroup]="form">
          <ng-container formArrayName="startUnits">
            @for (ctrl of startUnits().controls; let i = $index; track i) {
              @if (inputModeFor(i) === 'dropdown') {
                <mat-form-field appearance="outline" class="unit-field">
                  <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                  <mat-select
                    [formControlName]="i"
                    [attr.data-testid]="'timeline-event-start-unit-' + i">
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
                    [attr.data-testid]="'timeline-event-start-unit-' + i" />
                </mat-form-field>
              }
            }
          </ng-container>
        </div>
        <!-- Compatibility testid: combined start value (for legacy selectors). -->
        <input
          type="hidden"
          data-testid="timeline-event-start"
          [value]="combinedStart()" />

        <mat-checkbox
          formControlName="ranged"
          data-testid="timeline-event-ranged">
          Ranged event
        </mat-checkbox>

        @if (form.controls.ranged.value) {
          <div class="section-label">End</div>
          @if (isGregorian()) {
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input
                matInput
                type="date"
                [value]="endDateValue()"
                (change)="onEndDateChange($any($event.target).value)"
                data-testid="timeline-event-end-date" />
            </mat-form-field>
          }
          <div class="units-row" [formGroup]="form">
            <ng-container formArrayName="endUnits">
              @for (ctrl of endUnits().controls; let i = $index; track i) {
                @if (inputModeFor(i) === 'dropdown') {
                  <mat-form-field appearance="outline" class="unit-field">
                    <mat-label>{{ data.system.unitLabels[i] }}</mat-label>
                    <mat-select
                      [formControlName]="i"
                      [attr.data-testid]="'timeline-event-end-unit-' + i">
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
                      [attr.data-testid]="'timeline-event-end-unit-' + i" />
                  </mat-form-field>
                }
              }
            </ng-container>
          </div>
          <input
            type="hidden"
            data-testid="timeline-event-end"
            [value]="combinedEnd()" />
          @if (form.hasError('endBeforeStart')) {
            <div class="field-error" data-testid="timeline-event-range-error">
              End must be at or after start
            </div>
          }
        }

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            rows="3"
            formControlName="description"
            data-testid="timeline-event-description"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.event) {
        <button
          mat-button
          color="warn"
          data-testid="timeline-event-delete"
          (click)="onDelete()">
          Delete
        </button>
      }
      <span class="spacer"></span>
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        data-testid="timeline-event-save"
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
export class TimelineEventDialogComponent {
  protected readonly data = inject<TimelineEventDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<
      MatDialogRef<TimelineEventDialogComponent, TimelineEventDialogResult>
    >(MatDialogRef);

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
    title: FormControl<string>;
    trackId: FormControl<string>;
    startUnits: FormArray<FormControl<string>>;
    ranged: FormControl<boolean>;
    endUnits: FormArray<FormControl<string>>;
    description: FormControl<string>;
  }>;

  private readonly startDateSignal = signal('');
  private readonly endDateSignal = signal('');
  protected readonly startDateValue = this.startDateSignal.asReadonly();
  protected readonly endDateValue = this.endDateSignal.asReadonly();
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const n = this.data.system.unitLabels.length;
    const seed = (point: TimePoint | undefined): string[] => {
      if (point?.systemId === this.data.system.id) {
        return point.units.slice(0, n).map(String);
      }
      return Array.from({ length: n }, (_, i) => {
        const mode = unitInputModeFor(this.data.system, i);
        if (mode === 'dropdown') {
          const options = unitDropdownOptions(this.data.system, i);
          return options[0]?.value ?? '0';
        }
        const min = this.data.system.unitAllowZero?.[i] ? 0 : 1;
        return String(min);
      });
    };
    const startSeed = seed(this.data.event?.start);
    const endSeed = seed(this.data.event?.end);

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
      title: new FormControl<string>(this.data.event?.title ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(1)],
      }),
      trackId: new FormControl<string>(
        this.data.event?.trackId ??
          this.data.defaultTrackId ??
          this.data.tracks[0]?.id ??
          '',
        { nonNullable: true, validators: [Validators.required] }
      ),
      startUnits: buildUnitArray(startSeed),
      ranged: new FormControl<boolean>(!!this.data.event?.end, {
        nonNullable: true,
      }),
      endUnits: buildUnitArray(endSeed),
      description: new FormControl<string>(this.data.event?.description ?? '', {
        nonNullable: true,
      }),
    });

    // Cross-field validator: end >= start when ranged.
    this.form.addValidators(group => {
      const g = group as typeof this.form;
      if (!g.controls.ranged.value) return null;
      const start = this.pointFromUnits(g.controls.startUnits.getRawValue());
      const end = this.pointFromUnits(g.controls.endUnits.getRawValue());
      if (!start || !end) return null;
      if (
        !isValidTimePointFor(start, this.data.system) ||
        !isValidTimePointFor(end, this.data.system)
      ) {
        return null;
      }
      const sAbs = this.toAbsolute(start);
      const eAbs = this.toAbsolute(end);
      return eAbs < sAbs ? { endBeforeStart: true } : null;
    });

    this.form.updateValueAndValidity();

    this.startDateSignal.set(this.unitsToIsoDate('start'));
    this.endDateSignal.set(this.unitsToIsoDate('end'));

    // Keep the Gregorian date picker in sync when numeric unit fields are edited.
    this.form.controls.startUnits.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.startDateSignal.set(this.unitsToIsoDate('start')));
    this.form.controls.endUnits.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.endDateSignal.set(this.unitsToIsoDate('end')));
  }

  protected startUnits(): FormArray<FormControl<string>> {
    return this.form.controls.startUnits;
  }
  protected endUnits(): FormArray<FormControl<string>> {
    return this.form.controls.endUnits;
  }

  protected combinedStart(): string {
    return this.form.controls.startUnits
      .getRawValue()
      .join(this.data.system.parseSeparator || '-');
  }
  protected combinedEnd(): string {
    return this.form.controls.endUnits
      .getRawValue()
      .join(this.data.system.parseSeparator || '-');
  }

  protected onStartDateChange(value: string): void {
    this.applyIsoDateTo(value, 'start');
    this.startDateSignal.set(value);
  }
  protected onEndDateChange(value: string): void {
    this.applyIsoDateTo(value, 'end');
    this.endDateSignal.set(value);
  }

  private unitsToIsoDate(which: 'start' | 'end'): string {
    if (!this.isGregorian()) return '';
    const u =
      which === 'start'
        ? this.form.controls.startUnits.getRawValue()
        : this.form.controls.endUnits.getRawValue();
    if (u?.length !== 3) return '';
    const [y, m, d] = u.map(Number);
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
    if (!this.data.event) return;
    this.dialogRef.close({ kind: 'delete', eventId: this.data.event.id });
  }

  protected onSave(): void {
    if (this.form.invalid) return;
    const raw = this.form.getRawValue();
    const trimmedTitle = raw.title.trim();

    if (trimmedTitle === '') {
      this.form.controls.title.setErrors({ whitespace: true });
      return;
    }

    const start = this.pointFromUnits(raw.startUnits);
    if (!start || !isValidTimePointFor(start, this.data.system)) return;
    let end: TimePoint | undefined;
    if (raw.ranged) {
      const parsed = this.pointFromUnits(raw.endUnits);
      if (!parsed || !isValidTimePointFor(parsed, this.data.system)) return;
      end = parsed;
    }

    const base: TimelineEvent = {
      id: this.data.event?.id ?? '',
      trackId: raw.trackId,
      title: trimmedTitle,
      start,
      ...(end ? { end } : {}),
      ...(raw.description.trim().length > 0
        ? { description: raw.description.trim() }
        : {}),
      ...(this.data.event?.linkedElementId
        ? { linkedElementId: this.data.event.linkedElementId }
        : {}),
      ...(this.data.event?.color ? { color: this.data.event.color } : {}),
    };

    this.dialogRef.close({ kind: 'save', event: base });
  }
}
