import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { hexToHsv, hsvToHex, normalizeHex } from '../../../../utils/color';

/**
 * A compact color wheel + saturation/value square + hex input for picking a
 * solid color. Emits a normalized `#rrggbb` string on every change.
 */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  /** Current color as a `#rrggbb` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the normalized `#rrggbb` color whenever the user changes it. */
  readonly valueChange = output<string>();

  /** Hue (0-360) driving the wheel and the SV square's background. */
  protected readonly hue = signal(0);
  /** Saturation (0-100) of the SV square cursor. */
  protected readonly saturation = signal(100);
  /** Value/brightness (0-100) of the SV square cursor. */
  protected readonly brightness = signal(100);

  /** The color at the current hue (full saturation/value) for the SV square. */
  protected readonly hueColor = computed(() => hsvToHex(this.hue(), 100, 100));

  /** The currently selected color, derived from hue/saturation/value. */
  protected readonly selectedColor = computed(() =>
    hsvToHex(this.hue(), this.saturation(), this.brightness())
  );

  /** Cosine of the hue in radians (for positioning the wheel cursor). */
  protected cos(deg: number): number {
    return Math.cos((deg * Math.PI) / 180);
  }

  /** Sine of the hue in radians (for positioning the wheel cursor). */
  protected sin(deg: number): number {
    return Math.sin((deg * Math.PI) / 180);
  }

  constructor() {
    // Sync the internal HSV state whenever the bound value changes.
    effect(() => {
      this.syncFromValue();
    });
  }

  /** Sync the internal HSV state whenever the bound value changes. */
  protected syncFromValue(): void {
    const hsv = hexToHsv(this.value());
    if (!hsv) return;
    this.hue.set(hsv.h);
    this.saturation.set(hsv.s);
    this.brightness.set(hsv.v);
  }

  /** Handle a click/drag on the hue wheel. */
  protected onWheelPointer(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle =
      (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI;
    this.hue.set((angle + 360) % 360);
    this.emit();
  }

  /** Handle a click/drag on the saturation/value square. */
  protected onSquarePointer(event: PointerEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );
    const y = Math.min(
      1,
      Math.max(0, (event.clientY - rect.top) / rect.height)
    );
    this.saturation.set(x * 100);
    this.brightness.set((1 - y) * 100);
    this.emit();
  }

  /** Handle direct hex input. */
  protected onHexInput(event: Event): void {
    const normalized = normalizeHex((event.target as HTMLInputElement).value);
    if (normalized) {
      this.valueChange.emit(normalized);
    }
  }

  private emit(): void {
    this.valueChange.emit(this.selectedColor());
  }
}
