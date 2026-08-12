import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxInputColorComponent } from 'ngx-input-color/color-picker';

import { normalizeHex } from '../../../../utils/color';

/**
 * A colour chooser for a solid background colour, embedded inline in the panel
 * (no popup/dialog). Wraps `ngx-input-color` behind a signal-friendly API and
 * emits a normalized hex string.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgxInputColorComponent],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export class ColorPickerComponent {
  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  protected onColorChange(colour: string): void {
    const normalized = normalizeHex(colour);
    if (normalized) {
      this.valueChange.emit(normalized);
    }
  }
}
