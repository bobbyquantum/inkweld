import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  form,
  FormField,
  hidden,
  max,
  min,
  required,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';
import type {
  CanvasBlendMode,
  CanvasImage,
  CanvasImageFit,
  CanvasObject,
  CanvasPin,
  CanvasText,
} from '@inkweld/canvas';
import { TranslocoModule } from '@jsverse/transloco';

export interface CanvasEffectsDialogData {
  /** Pins draw their own shadow and take no blend mode. */
  object: Exclude<CanvasObject, CanvasPin>;
}

/**
 * The fields the dialog writes. Anything turned off is present and undefined,
 * so that merging it into the object clears the old value.
 */
export type CanvasEffectsResult = Partial<
  Pick<CanvasImage, 'shadow' | 'blendMode' | 'fit' | 'cornerRadius'> &
    Pick<CanvasText, 'stroke' | 'strokeWidth'>
>;

const NORMAL_BLEND = 'normal';

const BLEND_MODES: readonly {
  value: CanvasBlendMode | typeof NORMAL_BLEND;
  labelKey: string;
}[] = [
  { value: NORMAL_BLEND, labelKey: 'canvas.effectsDialog.blend.normal' },
  { value: 'multiply', labelKey: 'canvas.effectsDialog.blend.multiply' },
  { value: 'screen', labelKey: 'canvas.effectsDialog.blend.screen' },
  { value: 'overlay', labelKey: 'canvas.effectsDialog.blend.overlay' },
  { value: 'darken', labelKey: 'canvas.effectsDialog.blend.darken' },
  { value: 'lighten', labelKey: 'canvas.effectsDialog.blend.lighten' },
  { value: 'color-dodge', labelKey: 'canvas.effectsDialog.blend.colorDodge' },
  { value: 'color-burn', labelKey: 'canvas.effectsDialog.blend.colorBurn' },
  { value: 'hard-light', labelKey: 'canvas.effectsDialog.blend.hardLight' },
  { value: 'soft-light', labelKey: 'canvas.effectsDialog.blend.softLight' },
  { value: 'difference', labelKey: 'canvas.effectsDialog.blend.difference' },
  { value: 'exclusion', labelKey: 'canvas.effectsDialog.blend.exclusion' },
];

const IMAGE_FITS: readonly { value: CanvasImageFit; labelKey: string }[] = [
  { value: 'fill', labelKey: 'canvas.effectsDialog.fitFill' },
  { value: 'cover', labelKey: 'canvas.effectsDialog.fitCover' },
  { value: 'contain', labelKey: 'canvas.effectsDialog.fitContain' },
];

/** What a new shadow starts as: soft and slightly below the object. */
const NEW_SHADOW = { color: '#000000', blur: 12, offsetX: 0, offsetY: 4 };
const NEW_SHADOW_OPACITY_PERCENT = 40;
const NEW_OUTLINE_COLOR = '#000000';

/** The largest offset or corner an object can store, as in the canvas tools. */
const MAX_DISTANCE = 1_000_000;

interface CanvasEffectsFormValue {
  shadowOn: boolean;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacityPercent: number;
  blendMode: CanvasBlendMode | typeof NORMAL_BLEND;
  fit: CanvasImageFit;
  cornerRadius: number;
  outlineWidth: number;
}

/**
 * Shadow, blend mode and the settings particular to one kind of object: image
 * fit and corners, rectangle corners, text outline. Edits what an agent can set
 * through the canvas tools, so a person can change it too.
 */
@Component({
  selector: 'app-canvas-effects-dialog',
  templateUrl: './canvas-effects-dialog.component.html',
  styleUrls: ['./canvas-effects-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasEffectsDialogComponent {
  private readonly object =
    inject<CanvasEffectsDialogData>(MAT_DIALOG_DATA).object;
  private readonly dialogRef =
    inject<MatDialogRef<CanvasEffectsDialogComponent, CanvasEffectsResult>>(
      MatDialogRef
    );

  protected readonly blendModes = BLEND_MODES;
  protected readonly imageFits = IMAGE_FITS;

  protected readonly isImage = this.object.type === 'image';
  protected readonly isText = this.object.type === 'text';
  protected readonly hasCorners =
    this.object.type === 'image' ||
    (this.object.type === 'shape' && this.object.shapeType === 'rect');

  protected readonly shadowColor = signal(
    this.object.shadow?.color ?? NEW_SHADOW.color
  );
  protected readonly outlineColor = signal(
    (this.object.type === 'text' ? this.object.stroke : undefined) ??
      NEW_OUTLINE_COLOR
  );

  readonly model = signal<CanvasEffectsFormValue>(this.initialValue());

  readonly form = form(this.model, schemaPath => {
    // A number left bad in a section that is switched off cannot block Apply.
    for (const number of [
      schemaPath.shadowBlur,
      schemaPath.shadowOffsetX,
      schemaPath.shadowOffsetY,
      schemaPath.shadowOpacityPercent,
    ]) {
      hidden(number, ({ valueOf }) => !valueOf(schemaPath.shadowOn));
    }

    required(schemaPath.shadowBlur);
    min(schemaPath.shadowBlur, 0);
    max(schemaPath.shadowBlur, 1000);
    required(schemaPath.shadowOffsetX);
    min(schemaPath.shadowOffsetX, -MAX_DISTANCE);
    max(schemaPath.shadowOffsetX, MAX_DISTANCE);
    required(schemaPath.shadowOffsetY);
    min(schemaPath.shadowOffsetY, -MAX_DISTANCE);
    max(schemaPath.shadowOffsetY, MAX_DISTANCE);
    required(schemaPath.shadowOpacityPercent);
    min(schemaPath.shadowOpacityPercent, 0);
    max(schemaPath.shadowOpacityPercent, 100);
    required(schemaPath.cornerRadius);
    min(schemaPath.cornerRadius, 0);
    max(schemaPath.cornerRadius, MAX_DISTANCE);
    required(schemaPath.outlineWidth);
    min(schemaPath.outlineWidth, 0);
    max(schemaPath.outlineWidth, 1000);
  });

  private initialValue(): CanvasEffectsFormValue {
    const { object } = this;
    const { shadow } = object;
    return {
      shadowOn: !!shadow,
      shadowBlur: shadow?.blur ?? NEW_SHADOW.blur,
      shadowOffsetX: shadow?.offsetX ?? NEW_SHADOW.offsetX,
      shadowOffsetY: shadow?.offsetY ?? NEW_SHADOW.offsetY,
      shadowOpacityPercent: shadow
        ? Math.round((shadow.opacity ?? 1) * 100)
        : NEW_SHADOW_OPACITY_PERCENT,
      blendMode: object.blendMode ?? NORMAL_BLEND,
      fit: (object.type === 'image' ? object.fit : undefined) ?? 'fill',
      cornerRadius:
        (object.type === 'image' || object.type === 'shape'
          ? object.cornerRadius
          : undefined) ?? 0,
      outlineWidth:
        (object.type === 'text' ? object.strokeWidth : undefined) ?? 0,
    };
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onApply(): void {
    if (this.form().invalid()) return;
    this.dialogRef.close(this.buildResult());
  }

  /** Defaults are left out, so an object with no effects stays small when stored. */
  private buildResult(): CanvasEffectsResult {
    const value = this.model();
    const result: CanvasEffectsResult = {
      shadow: value.shadowOn
        ? {
            color: this.shadowColor(),
            blur: value.shadowBlur,
            offsetX: value.shadowOffsetX,
            offsetY: value.shadowOffsetY,
            opacity:
              value.shadowOpacityPercent === 100
                ? undefined
                : value.shadowOpacityPercent / 100,
          }
        : undefined,
      blendMode: value.blendMode === NORMAL_BLEND ? undefined : value.blendMode,
    };
    if (this.isImage) {
      result.fit = value.fit === 'fill' ? undefined : value.fit;
    }
    if (this.hasCorners) {
      result.cornerRadius =
        value.cornerRadius === 0 ? undefined : value.cornerRadius;
    }
    if (this.isText) {
      const outlined = value.outlineWidth > 0;
      result.stroke = outlined ? this.outlineColor() : undefined;
      result.strokeWidth = outlined ? value.outlineWidth : undefined;
    }
    return result;
  }
}
