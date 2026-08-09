import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { ColorPickerDirective } from 'ngx-color-picker';

/**
 * A colour chooser for a solid background colour.
 *
 * Uses `ngx-color-picker`'s full colour dialog (wheel + saturation/value +
 * hex/RGB/HSL inputs + presets + eyedropper). Emits a normalized hex string.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ColorPickerDirective],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  protected onColorChange(color: string): void {
    if (color) {
      this.valueChange.emit(color);
    }
  }
}
