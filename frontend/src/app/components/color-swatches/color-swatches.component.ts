import {
  Component,
  type ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  ViewChild,
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
  templateUrl: './color-swatches.component.html',
  styleUrls: ['./color-swatches.component.scss'],
  imports: [FormsModule, MatIconModule, MatInputModule, MatTooltipModule],
})
export class ColorSwatchesComponent {
  @Input() selectedColor = '#333333';
  @Output() colorChange = new EventEmitter<string>();

  @HostBinding('attr.data-testid')
  readonly testId = 'color-swatches';

  @ViewChild('hexInputEl')
  private readonly hexInputRef!: ElementRef<HTMLInputElement>;

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
    return this.selectedColor.replaceAll('#', '');
  }

  selectColor(color: string): void {
    this.selectedColor = color;
    this.colorChange.emit(color);
  }

  onHexInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Strip non-hex characters
    input.value = input.value.replaceAll(/[^0-9a-fA-F]/g, '');
  }

  onHexBlur(): void {
    // Read raw value from the input
    const el = this.hexInputRef?.nativeElement;
    if (!el) return;
    const hex = el.value.replaceAll(/[^0-9a-fA-F]/g, '');
    if (hex.length === 3 || hex.length === 6) {
      const color = `#${hex.toUpperCase()}`;
      this.selectedColor = color;
      this.colorChange.emit(color);
    }
  }
}
