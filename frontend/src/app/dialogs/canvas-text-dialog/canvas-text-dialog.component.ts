import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, max, min, required } from '@angular/forms/signals';
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
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';
import { CANVAS_BUNDLED_FONTS, type CanvasText } from '@inkweld/canvas';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

/** How a text object's letters look, as the dialog edits it. */
export type CanvasTextTypography = Pick<
  CanvasText,
  'fontFamily' | 'fontStyle' | 'fontSize' | 'lineHeight' | 'letterSpacing'
>;

export interface CanvasTextDialogData extends CanvasTextTypography {
  /** Dialog title */
  title: string;
  /** Pre-filled text content */
  text: string;
  /** Current text color */
  color: string;
  /** Confirm button label */
  confirmLabel?: string;
}

export interface CanvasTextDialogResult extends CanvasTextTypography {
  text: string;
  color: string;
}

/** Fonts every browser has, offered alongside the ones Inkweld ships. */
const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New'];

const FONT_STYLES: readonly {
  value: CanvasText['fontStyle'];
  labelKey: string;
}[] = [
  { value: 'normal', labelKey: 'canvas.textDialog.styleNormal' },
  { value: 'bold', labelKey: 'canvas.textDialog.styleBold' },
  { value: 'italic', labelKey: 'canvas.textDialog.styleItalic' },
  { value: 'bold italic', labelKey: 'canvas.textDialog.styleBoldItalic' },
];

interface CanvasTextFormValue {
  text: string;
  fontFamily: string;
  fontStyle: CanvasText['fontStyle'];
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

@Component({
  selector: 'app-canvas-text-dialog',
  templateUrl: './canvas-text-dialog.component.html',
  styleUrls: ['./canvas-text-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    TranslocoModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasTextDialogComponent {
  protected readonly data = inject<CanvasTextDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasTextDialogComponent>);
  private readonly transloco = inject(TranslocoService);

  protected readonly fontStyles = FONT_STYLES;
  /** The shipped fonts first, then system fonts, then the text's own if other. */
  protected readonly fonts = [
    ...new Set([
      ...CANVAS_BUNDLED_FONTS,
      ...SYSTEM_FONTS,
      this.data.fontFamily,
    ]),
  ];

  readonly model = signal<CanvasTextFormValue>({
    text: this.data.text,
    fontFamily: this.data.fontFamily,
    fontStyle: this.data.fontStyle,
    fontSize: this.data.fontSize,
    lineHeight: this.data.lineHeight ?? 1,
    letterSpacing: this.data.letterSpacing ?? 0,
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.text, {
      message: this.transloco.translate('canvas.textDialog.textRequired'),
    });
    required(schemaPath.fontSize);
    min(schemaPath.fontSize, 1);
    max(schemaPath.fontSize, 2000);
    required(schemaPath.lineHeight);
    min(schemaPath.lineHeight, 0.1);
    max(schemaPath.lineHeight, 10);
    required(schemaPath.letterSpacing);
    min(schemaPath.letterSpacing, -1000);
    max(schemaPath.letterSpacing, 1000);
  });

  protected selectedColor = this.data.color;

  onColorChange(color: string): void {
    this.selectedColor = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form().valid()) {
      const { lineHeight, letterSpacing, ...value } = this.model();
      const result: CanvasTextDialogResult = {
        ...value,
        color: this.selectedColor,
        // The defaults are left out, so plain text stays small when stored.
        lineHeight: lineHeight === 1 ? undefined : lineHeight,
        letterSpacing: letterSpacing === 0 ? undefined : letterSpacing,
      };
      this.dialogRef.close(result);
    }
  }
}
