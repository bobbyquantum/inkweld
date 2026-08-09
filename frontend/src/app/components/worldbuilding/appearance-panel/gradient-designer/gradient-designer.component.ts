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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

import { normalizeHex } from '../../../../utils/color';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

/** A single gradient color stop. */
export interface GradientStop {
  color: string;
  position: number; // 0-100
}

/** Parse a CSS linear-gradient into stops + angle. Returns null if unparseable. */
export function parseGradient(
  value: string
): { stops: GradientStop[]; angle: number } | null {
  const trimmed = value.trim();
  if (!/^linear-gradient\(/i.test(trimmed) || !trimmed.endsWith(')')) {
    return null;
  }
  const inner = trimmed.slice('linear-gradient('.length, -1);

  let angle = 180;
  let body = inner;
  const angleMatch = /^\s*([-+]?\d+(?:\.\d+)?deg)\s*,\s*/i.exec(inner);
  if (angleMatch) {
    angle = Number.parseFloat(angleMatch[1]) || 180;
    body = inner.slice(angleMatch[0].length);
  }

  const stops: GradientStop[] = [];
  for (const part of body.split(',')) {
    const trimmedPart = part.trim();
    // A bare color (no position) matches entirely; otherwise parse "color pos%".
    if (/^#[0-9a-f]{3,8}$/i.test(trimmedPart)) {
      stops.push({ color: trimmedPart, position: 0 });
      continue;
    }
    const namedMatch = /^([a-z]+)$/i.exec(trimmedPart);
    if (namedMatch) {
      stops.push({ color: namedMatch[1], position: 0 });
      continue;
    }
    const stopMatch = /^((?:#[0-9a-f]{3,8}|[a-z]+))\s*(\d+(?:\.\d+)?)%?$/i.exec(
      trimmedPart
    );
    if (!stopMatch) continue;
    const color = normalizeHex(stopMatch[1]) ?? stopMatch[1];
    const position = Number.parseFloat(stopMatch[2]);
    stops.push({ color, position });
  }

  if (stops.length < 2) return null;
  // Normalise positions: if none given, spread evenly.
  if (stops.every(s => s.position === 0)) {
    stops.forEach((s, i) => {
      s.position = (i / (stops.length - 1)) * 100;
    });
  }
  return { stops, angle };
}

/** Serialize stops + angle into a CSS linear-gradient string. */
export function serializeGradient(
  stops: GradientStop[],
  angle: number
): string {
  const parts = stops.map(s => `${s.color} ${s.position}%`).join(', ');
  return `linear-gradient(${angle}deg, ${parts})`;
}

/**
 * A visual gradient designer: an angle slider plus a draggable multi-stop
 * color bar. Emits a CSS `linear-gradient(...)` string on every change.
 */
@Component({
  selector: 'app-gradient-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoModule,
    ColorPickerComponent,
  ],
  templateUrl: './gradient-designer.component.html',
  styleUrl: './gradient-designer.component.scss',
})
export class GradientDesignerComponent {
  /** Current gradient as a CSS `linear-gradient(...)` string. */
  value = input<string>('');
  disabled = input<boolean>(false);

  /** Emits the serialized `linear-gradient(...)` string on change. */
  readonly valueChange = output<string>();

  protected readonly stops = signal<GradientStop[]>([]);
  protected readonly angle = signal(180);
  protected selectedIndex = signal(0);
  /** True while a stop is being dragged along the bar. */
  private dragging = false;

  /** The CSS background for the preview bar. */
  protected readonly preview = computed(() =>
    serializeGradient(this.stops(), this.angle())
  );

  constructor() {
    effect(() => {
      this.syncFromValue();
    });
  }

  protected syncFromValue(): void {
    const parsed = parseGradient(this.value());
    if (!parsed) {
      this.stops.set([
        { color: '#4fd8eb', position: 0 },
        { color: '#ffffff', position: 100 },
      ]);
      this.angle.set(180);
      return;
    }
    this.stops.set(parsed.stops);
    this.angle.set(parsed.angle);
  }

  protected onAngleInput(event: Event): void {
    this.angle.set(Number((event.target as HTMLInputElement).value) || 0);
    this.emit();
  }

  /** Begin dragging the given stop. */
  protected onStopPointerDown(index: number, event: PointerEvent): void {
    this.selectedIndex.set(index);
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.moveStopToPointer(event);
  }

  /** Move the dragged stop to match the pointer's position along the bar. */
  protected onStopPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    this.moveStopToPointer(event);
  }

  /** End dragging a stop. */
  protected onStopPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.moveStopToPointer(event);
  }

  private moveStopToPointer(event: PointerEvent): void {
    const current = event.currentTarget as Element | null;
    const bar = current?.closest(
      '[data-testid="gradient-bar"]'
    ) as HTMLElement | null;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const position = Math.min(
      100,
      Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)
    );
    const idx = this.selectedIndex();
    this.stops.update(stops =>
      stops.map((s, i) => (i === idx ? { ...s, position } : s))
    );
    this.emit();
  }

  protected selectStop(index: number): void {
    this.selectedIndex.set(index);
  }

  protected onStopColorChange(index: number, color: string): void {
    const normalized = normalizeHex(color);
    if (!normalized) return;
    this.stops.update(stops =>
      stops.map((s, i) => (i === index ? { ...s, color: normalized } : s))
    );
    this.emit();
  }

  protected addStop(): void {
    this.stops.update(stops => {
      const next = [...stops];
      if (next.length === 0) {
        next.push({ color: '#ffffff', position: 0 });
        return next;
      }
      const last = next.at(-1) as GradientStop;
      const position =
        next.length === 1
          ? Math.min(100, last.position + 10)
          : ((next.at(-2) as GradientStop).position + last.position) / 2;
      next.push({ color: last.color, position });
      return next;
    });
    this.selectedIndex.set(this.stops().length - 1);
    this.emit();
  }

  protected removeStop(): void {
    if (this.stops().length <= 2) return;
    const idx = this.selectedIndex();
    this.stops.update(stops => stops.filter((_, i) => i !== idx));
    this.selectedIndex.set(Math.max(0, idx - 1));
    this.emit();
  }

  private emit(): void {
    this.valueChange.emit(this.preview());
  }
}
