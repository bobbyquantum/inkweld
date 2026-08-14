import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
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

  /**
   * The wrapped library computes its saturation-board thumb position from a
   * getBoundingClientRect() measurement taken during writeValue. If the picker
   * mounts before layout settles (zoneless change detection), that measurement
   * is zero and the thumb sticks to the top-left. We therefore defer mounting
   * the library until after the first render so it measures real dimensions.
   */
  protected readonly renderReady = signal(false);

  constructor() {
    afterNextRender(() => {
      this.renderReady.set(true);
    });
  }

  protected onColorChange(colour: string): void {
    const normalized = normalizeHex(colour);
    if (normalized) {
      this.valueChange.emit(normalized);
    }
  }
}
