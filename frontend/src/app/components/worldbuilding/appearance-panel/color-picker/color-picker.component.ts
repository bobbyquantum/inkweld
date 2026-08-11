import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { HsvPickerComponent } from './hsv-picker.component';

/**
 * A colour chooser for a solid background colour, embedded inline in the panel
 * (no popup/dialog). Emits a normalized hex string.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HsvPickerComponent],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  protected onColorChange(colour: string): void {
    if (colour) {
      this.valueChange.emit(colour);
    }
  }
}
