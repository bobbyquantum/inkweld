import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Compact color palette with preset swatches and a custom hex input.
 * Designed for canvas property editing — supports any CSS color string.
 */
@Component({
  selector: 'app-color-swatches',
  template: `
    <div class="swatches-grid">
      @for (color of colors; track color) {
        <button
          type="button"
          class="swatch"
          [class.selected]="selectedColor === color"
          [style.background]="color"
          [matTooltip]="color"
          (click)="selectColor(color)">
          @if (selectedColor === color) {
            <mat-icon class="check-icon">check</mat-icon>
          }
        </button>
      }
    </div>
    <div class="custom-color">
      <label class="hex-label" for="hexInput">Custom</label>
      <div class="hex-input-group">
        <span class="hash">#</span>
        <input
          id="hexInput"
          type="text"
          class="hex-input"
          maxlength="6"
          [value]="hexValue"
          (input)="onHexInput($event)"
          (blur)="onHexBlur()"
          placeholder="333333" />
        <button
          type="button"
          class="preview-swatch"
          [style.background]="selectedColor"
          aria-label="Apply custom color"
          (click)="onHexBlur()"></button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .swatches-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .swatch {
        width: 28px;
        height: 28px;
        border-radius: 4px;
        border: 2px solid transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          border-color 0.15s,
          transform 0.1s;
        padding: 0;
        outline: none;
      }
      .swatch:hover {
        transform: scale(1.1);
      }
      .swatch.selected {
        border-color: var(--sys-primary);
        box-shadow: 0 0 0 1px var(--sys-primary);
      }
      .check-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }
      .custom-color {
        margin-top: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hex-label {
        font-size: 12px;
        color: var(--sys-on-surface-variant);
        flex-shrink: 0;
      }
      .hex-input-group {
        display: flex;
        align-items: center;
        gap: 2px;
        border: 1px solid var(--sys-outline-variant);
        border-radius: 6px;
        padding: 4px 8px;
        background: var(--sys-surface);
      }
      .hash {
        font-size: 13px;
        color: var(--sys-on-surface-variant);
        font-family: monospace;
      }
      .hex-input {
        width: 60px;
        border: none;
        outline: none;
        background: transparent;
        font-size: 13px;
        font-family: monospace;
        letter-spacing: 1px;
        color: var(--sys-on-surface);
      }
      .preview-swatch {
        width: 20px;
        height: 20px;
        border-radius: 3px;
        border: 1px solid var(--sys-outline-variant);
        flex-shrink: 0;
        cursor: pointer;
        padding: 0;
      }
    `,
  ],
  standalone: true,
  imports: [FormsModule, MatIconModule, MatInputModule, MatTooltipModule],
})
export class ColorSwatchesComponent {
  @Input() selectedColor = '#333333';
  @Output() colorChange = new EventEmitter<string>();

  @HostBinding('attr.data-testid')
  readonly testId = 'color-swatches';

  /** Curated palette — Material Design inspired */
  readonly colors: string[] = [
    // Grays
    '#000000',
    '#424242',
    '#757575',
    '#9E9E9E',
    '#BDBDBD',
    '#FFFFFF',
    // Reds
    '#E53935',
    '#F44336',
    '#EF9A9A',
    // Oranges
    '#FB8C00',
    '#FFB74D',
    '#FFE0B2',
    // Yellows
    '#FDD835',
    '#FFF176',
    '#FFF9C4',
    // Greens
    '#43A047',
    '#66BB6A',
    '#A5D6A7',
    // Blues
    '#1E88E5',
    '#42A5F5',
    '#90CAF9',
    // Purples
    '#8E24AA',
    '#AB47BC',
    '#CE93D8',
    // Teals
    '#00897B',
    '#26A69A',
    '#80CBC4',
    // Pinks
    '#D81B60',
    '#EC407A',
    '#F48FB1',
  ];

  get hexValue(): string {
    return this.selectedColor.replace('#', '');
  }

  selectColor(color: string): void {
    this.selectedColor = color;
    this.colorChange.emit(color);
  }

  onHexInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Strip non-hex characters
    input.value = input.value.replace(/[^0-9a-fA-F]/g, '');
  }

  onHexBlur(): void {
    // Read raw value from the input
    const el = document.getElementById('hexInput') as HTMLInputElement | null;
    if (!el) return;
    const hex = el.value.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length === 3 || hex.length === 6) {
      const color = `#${hex.toUpperCase()}`;
      this.selectedColor = color;
      this.colorChange.emit(color);
    }
  }
}
