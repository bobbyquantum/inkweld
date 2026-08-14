import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxInputGradientComponent } from 'ngx-input-color/gradient-picker';

/**
 * A gradient designer wrapping `ngx-input-gradient` behind a signal-friendly
 * API. Provides click-to-add stops, draggable stops, per-stop colour picking,
 * rotation, and linear/radial types. Emits a CSS `linear-gradient(...)` string.
 */
@Component({
  selector: 'app-gradient-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgxInputGradientComponent],
  templateUrl: './gradient-designer.component.html',
  styleUrl: './gradient-designer.component.scss',
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export class GradientDesignerComponent {
  /** Current gradient as a CSS `linear-gradient(...)` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the serialized `linear-gradient(...)` string on change. */
  readonly valueChange = output<string>();

  constructor() {
    // Mirrors ColorPickerComponent: the wrapped library positions its thumb
    // handles from getBoundingClientRect() during writeValue, which runs before
    // layout when a gradient is preset. Bouncing a window resize after the
    // first render lets the library re-measure and place the thumbs correctly.
    afterNextRender(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  protected onGradientChange(gradient: string): void {
    if (gradient) {
      this.valueChange.emit(gradient);
    }
  }
}
