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
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { hexToHsv, hsvToHex, normalizeHex } from '../../../../utils/color';

/**
 * A self-contained HSV colour picker that renders entirely inside its host
 * layout (no external popup/dialog). Emits a normalized hex colour on change.
 */
@Component({
  selector: 'app-hsv-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './hsv-picker.component.html',
  styleUrl: './hsv-picker.component.scss',
})
export class HsvPickerComponent {
  /** Current hex colour (`#rrggbb`). */
  value = input<string>('');

  /** Emits the selected hex colour whenever it changes. */
  readonly valueChange = output<string>();

  protected readonly hue = signal(0);
  protected readonly saturation = signal(100);
  protected readonly brightness = signal(100);

  protected readonly hueColor = computed(() => hsvToHex(this.hue(), 100, 100));
  protected readonly selectedColor = computed(() =>
    hsvToHex(this.hue(), this.saturation(), this.brightness())
  );

  protected readonly svCursorLeft = computed(() => this.saturation());
  protected readonly svCursorTop = computed(() => 100 - this.brightness());

  constructor() {
    effect(() => this.syncFromValue());
  }

  private syncFromValue(): void {
    const hsv = hexToHsv(this.value());
    if (!hsv) return;
    this.hue.set(hsv.h);
    this.saturation.set(hsv.s);
    this.brightness.set(hsv.v);
  }

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

  protected onHueInput(event: Event): void {
    this.hue.set(Number((event.target as HTMLInputElement).value) || 0);
    this.emit();
  }

  protected onHexInput(event: Event): void {
    const normalized = normalizeHex((event.target as HTMLInputElement).value);
    if (!normalized) return;
    this.valueChange.emit(normalized);
  }

  private emit(): void {
    this.valueChange.emit(this.selectedColor());
  }
}
