import {
  ChangeDetectionStrategy,
  Component,
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
export class FieldConfigDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<FieldConfigDialogComponent>);
  protected readonly data = inject<FieldConfigDialogData>(MAT_DIALOG_DATA);

  protected readonly key = signal(this.data.field.key);
  protected readonly label = signal(this.data.field.label);
  protected readonly type = signal(this.data.field.type);
  protected readonly placeholder = signal(this.data.field.placeholder ?? '');
  protected readonly description = signal(this.data.field.description ?? '');
  protected readonly options = signal<string[]>(
    (this.data.field.options ?? []).map(opt =>
      typeof opt === 'string' ? opt : opt.value
    )
  );
  protected readonly required = signal(
    this.data.field.validation?.required ?? false
  );
  protected readonly span = signal(this.data.field.layout?.span ?? 12);
  protected readonly rows = signal(this.data.field.rows ?? 3);

  protected isOptionsType(): boolean {
    return this.type() === 'select' || this.type() === 'multiselect';
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
    const trimmedKey = this.key().trim();
    if (!trimmedKey) {
      return;
    }

    const result: Partial<FieldSchema> = {
      key: trimmedKey,
      label: this.label().trim(),
      type: this.type(),
      validation: { required: this.required() },
      layout: { span: this.clamp(this.span(), 1, 12) },
    };

    const trimmedPlaceholder = this.placeholder().trim();
    if (trimmedPlaceholder) {
      result.placeholder = trimmedPlaceholder;
    }

    const trimmedDescription = this.description().trim();
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

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }
}
