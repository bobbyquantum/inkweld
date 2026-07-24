import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  required,
  validate,
  validateTree,
} from '@angular/forms/signals';
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

interface TimelineEventFormValue {
  title: string;
  trackId: string;
  startUnits: string[];
  ranged: boolean;
  endUnits: string[];
  description: string;
}

@Component({
  selector: 'app-timeline-event-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './timeline-event-dialog.component.html',
  styleUrls: ['./timeline-event-dialog.component.scss'],
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

  private readonly startDateSignal = signal('');
  private readonly endDateSignal = signal('');
  protected readonly startDateValue = this.startDateSignal.asReadonly();
  protected readonly endDateValue = this.endDateSignal.asReadonly();

  readonly model = signal<TimelineEventFormValue>({
    title: this.data.event?.title ?? '',
    trackId:
      this.data.event?.trackId ??
      this.data.defaultTrackId ??
      this.data.tracks[0]?.id ??
      '',
    startUnits: this.seedUnits(this.data.event?.start),
    ranged: !!this.data.event?.end,
    endUnits: this.seedUnits(this.data.event?.end),
    description: this.data.event?.description ?? '',
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.title, { message: 'Title is required' });
    required(schemaPath.trackId, { message: 'Track is required' });

    applyEach(schemaPath.startUnits, item => {
      validate(item, ({ value }) => {
        const v = String(value() ?? '').trim();
        if (v.length === 0) return { kind: 'required', message: 'Required' };
        return INT_RE.test(v)
          ? null
          : { kind: 'integer', message: 'Must be an integer' };
      });
    });

    applyEach(schemaPath.endUnits, item => {
      validate(item, ({ value }) => {
        const v = String(value() ?? '').trim();
        if (v.length === 0) return { kind: 'required', message: 'Required' };
        return INT_RE.test(v)
          ? null
          : { kind: 'integer', message: 'Must be an integer' };
      });
    });

    // Cross-field validator: end >= start when ranged.
    validateTree(schemaPath, ctx => {
      if (!ctx.valueOf(schemaPath.ranged)) return null;
      const start = this.pointFromUnits(ctx.valueOf(schemaPath.startUnits));
      const end = this.pointFromUnits(ctx.valueOf(schemaPath.endUnits));
      if (!start || !end) return null;
      if (
        !isValidTimePointFor(start, this.data.system) ||
        !isValidTimePointFor(end, this.data.system)
      ) {
        return null;
      }
      const sAbs = this.toAbsolute(start);
      const eAbs = this.toAbsolute(end);
      return eAbs < sAbs
        ? {
            kind: 'endBeforeStart',
            message: 'End must be at or after start',
            fieldTree: ctx.fieldTree.endUnits,
          }
        : null;
    });
  });

  constructor() {
    this.startDateSignal.set(this.unitsToIsoDate('start'));
    this.endDateSignal.set(this.unitsToIsoDate('end'));

    // Keep the Gregorian date picker in sync when numeric unit fields are edited.
    effect(() => {
      const startUnits = this.model().startUnits;
      void startUnits; // track for reactivity
      this.startDateSignal.set(this.unitsToIsoDate('start'));
    });
    effect(() => {
      const endUnits = this.model().endUnits;
      void endUnits; // track for reactivity
      this.endDateSignal.set(this.unitsToIsoDate('end'));
    });
  }

  private seedUnits(point: TimePoint | undefined): string[] {
    const n = this.data.system.unitLabels.length;
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
  }

  protected combinedStart(): string {
    return this.model().startUnits.join(this.data.system.parseSeparator || '-');
  }
  protected combinedEnd(): string {
    return this.model().endUnits.join(this.data.system.parseSeparator || '-');
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
      which === 'start' ? this.model().startUnits : this.model().endUnits;
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
    const key = which === 'start' ? 'startUnits' : 'endUnits';
    this.model.update(m2 => ({ ...m2, [key]: units }));
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
    if (this.form().invalid()) return;
    const raw = this.model();
    const trimmedTitle = raw.title.trim();

    if (trimmedTitle === '') {
      // Signal forms doesn't support setErrors; mark touched to show required
      this.form.title().markAsTouched();
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
