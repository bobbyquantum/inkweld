import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { TranslocoModule } from '@jsverse/transloco';
import type { FieldSchema } from '@models/schema-types';

export interface FieldConfigDialogData {
  field: FieldSchema;
  fieldTypes: { value: string; label: string }[];
}

export type FieldConfigDialogResult = Partial<FieldSchema>;

/**
 * Edits a schema field's properties (label, key, type, placeholder,
 * description, options, required, span, rows) in a dialog rather than
 * inline in the preview.
 */
@Component({
  selector: 'app-field-config-dialog',
  templateUrl: './field-config-dialog.component.html',
  styleUrls: ['./field-config-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    FormsModule,
    TranslocoModule,
  ],
})
export class FieldConfigDialogComponent implements AfterViewInit {
  private readonly dialogRef = inject(MatDialogRef<FieldConfigDialogComponent>);
  protected readonly data = inject<FieldConfigDialogData>(MAT_DIALOG_DATA);

  // Reactive UI state only. Text input values are NOT bound with [value]:
  // in zoneless mode a [value] binding re-runs during CD and can interact
  // poorly with rapid Playwright fill()/select() sequences (the same issue
  // RenameDialogComponent avoids). Seed the DOM once via viewChild refs
  // instead, and read the final values from the DOM in onSave().
  protected readonly type = signal(this.data.field.type);
  protected readonly required = signal(
    this.data.field.validation?.required ?? false
  );
  protected readonly span = signal(this.data.field.layout?.span ?? 12);
  protected readonly rows = signal(this.data.field.rows ?? 3);
  protected readonly options = signal<string[]>(
    (this.data.field.options ?? []).map(opt =>
      typeof opt === 'string' ? opt : opt.value
    )
  );
  /** Tracks whether the typed key is a dotted (nested-group) key. */
  protected readonly keyIsNested = signal(this.data.field.key.includes('.'));
  /** Save is disabled until the key is non-empty. */
  protected readonly canSave = signal(true);

  /** Cell indexes (0-11) for the 12-column span picker. */
  protected readonly spanCells = Array.from({ length: 12 }, (_, i) => i);

  private readonly keyInput =
    viewChild<ElementRef<HTMLInputElement>>('keyInput');
  private readonly labelInput =
    viewChild<ElementRef<HTMLInputElement>>('labelInput');
  private readonly placeholderInput =
    viewChild<ElementRef<HTMLInputElement>>('placeholderInput');
  private readonly descriptionInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('descriptionInput');

  private spanDragging = false;

  ngAfterViewInit(): void {
    // Seed the DOM inputs synchronously. No [value] binding means change
    // detection can never clobber what the user (or a test) types into these
    // fields — but the seeding must NOT be deferred (e.g. queueMicrotask):
    // a deferred seed can fire AFTER a rapid programmatic fill and overwrite
    // the typed value with the stale initial one.
    const set = (
      ref: ElementRef<HTMLInputElement | HTMLTextAreaElement> | undefined,
      value: string
    ) => {
      const el = ref?.nativeElement;
      if (el) el.value = value;
    };
    set(this.keyInput(), this.data.field.key);
    set(this.labelInput(), this.data.field.label);
    set(this.placeholderInput(), this.data.field.placeholder ?? '');
    set(this.descriptionInput(), this.data.field.description ?? '');

    // Seed the (uncontrolled) option inputs with their current values.
    const host = this.keyInput()?.nativeElement.closest('.field-config-form');
    this.options().forEach((opt, i) => {
      const el = host?.querySelector(
        `[data-testid="fc-option-input-${i}"]`
      ) as HTMLInputElement | null;
      if (el) el.value = opt;
    });
  }

  protected isOptionsType(): boolean {
    return this.type() === 'select' || this.type() === 'multiselect';
  }

  protected onKeyInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.keyIsNested.set(value.includes('.'));
    this.canSave.set(value.trim().length > 0);
  }

  /** Set the span by clicking a grid cell (1-12). */
  protected onSpanCell(index: number): void {
    this.span.set(index + 1);
  }

  /** Begin dragging the span handle. */
  protected startSpanDrag(event: PointerEvent): void {
    this.spanDragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  /** Update the span from the pointer position over the grid. */
  protected updateSpanDrag(event: PointerEvent): void {
    if (!this.spanDragging) return;
    const el = event.currentTarget as HTMLElement | null;
    const grid = el?.closest('.span-grid') as HTMLElement | null;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    this.span.set(Math.min(12, Math.max(1, Math.round(ratio * 12))));
  }

  /** End the span drag. */
  protected endSpanDrag(event: PointerEvent): void {
    this.spanDragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(
      event.pointerId
    );
  }

  protected addOption(): void {
    this.options.update(options => [...options, '']);
  }

  protected removeOption(index: number): void {
    this.options.update(options => options.filter((_, i) => i !== index));
  }

  protected updateOption(index: number, value: string): void {
    this.options.update(options =>
      options.map((opt, i) => (i === index ? value : opt))
    );
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    const trimmedKey = this.readInput(this.keyInput()).trim();
    if (!trimmedKey) {
      return;
    }

    const result: Partial<FieldSchema> = {
      key: trimmedKey,
      label: this.readInput(this.labelInput()).trim(),
      type: this.type(),
      layout: { span: this.clamp(this.span(), 1, 12) },
    };

    // Only store validation when the field is required, so fields edited
    // without a requirement don't accumulate an empty validation object.
    if (this.required()) {
      result.validation = { required: true };
    }

    const trimmedPlaceholder = this.readInput(this.placeholderInput()).trim();
    if (trimmedPlaceholder) {
      result.placeholder = trimmedPlaceholder;
    }

    const trimmedDescription = this.readInput(this.descriptionInput()).trim();
    if (trimmedDescription) {
      result.description = trimmedDescription;
    }

    if (this.isOptionsType()) {
      result.options = this.options()
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);
    }

    if (this.type() === 'textarea') {
      result.rows = this.clamp(this.rows(), 1, 20);
    }

    this.dialogRef.close(result);
  }

  private readInput(
    ref: ElementRef<HTMLInputElement | HTMLTextAreaElement> | undefined
  ): string {
    return ref?.nativeElement.value ?? '';
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }
}
