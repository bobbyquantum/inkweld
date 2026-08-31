import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  type OnChanges,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';

import { ColorPickerComponent } from '../worldbuilding/appearance-panel/color-picker/color-picker.component';
import { GradientDesignerComponent } from '../worldbuilding/appearance-panel/gradient-designer/gradient-designer.component';

/** True when a value is a CSS gradient string. */
function isGradientValue(value: string): boolean {
  return /^(linear|radial)-gradient\(/.test(value.trim());
}

/**
 * Colour chooser for canvas property editing: preset swatches for quick
 * picks, the full colour picker (shared with the worldbuilding appearance
 * panel) for custom colours, and — where `allowGradient` is set, e.g. shape
 * fills — a gradient mode using the shared gradient designer, emitting a CSS
 * `linear-gradient(...)` string.
 */
@Component({
  selector: 'app-color-swatches',
  templateUrl: './color-swatches.component.html',
  styleUrls: ['./color-swatches.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoModule,
    ColorPickerComponent,
    GradientDesignerComponent,
  ],
})
export class ColorSwatchesComponent implements OnChanges {
  @Input() selectedColor = '#333333';
  /** Offer a gradient mode (shape fills only). */
  @Input() allowGradient = false;
  @Output() colorChange = new EventEmitter<string>();

  @HostBinding('attr.data-testid')
  readonly testId = 'color-swatches';

  /** 'solid' shows swatches + picker; 'gradient' shows the designer. */
  protected readonly mode = signal<'solid' | 'gradient'>('solid');

  /** Whether the full picker is expanded below the swatches. */
  protected readonly pickerOpen = signal(false);

  /** Last solid colour, kept so mode switches don't lose it. */
  protected readonly solidColor = signal('#333333');

  /** Last gradient, kept so mode switches don't lose it. */
  protected readonly gradientValue = signal('');

  ngOnChanges(): void {
    if (isGradientValue(this.selectedColor)) {
      this.gradientValue.set(this.selectedColor);
      if (this.allowGradient) this.mode.set('gradient');
    } else if (this.selectedColor) {
      this.solidColor.set(this.selectedColor);
    }
  }

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

  protected setMode(mode: 'solid' | 'gradient'): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    // Switching modes re-emits the value that mode last held, so the
    // consumer's state follows what is on screen.
    if (mode === 'solid') {
      this.emitColor(this.solidColor());
    } else if (this.gradientValue()) {
      this.emitColor(this.gradientValue());
    }
  }

  protected togglePicker(): void {
    this.pickerOpen.update(open => !open);
  }

  selectColor(color: string): void {
    this.solidColor.set(color);
    this.emitColor(color);
  }

  protected onPickerChange(color: string): void {
    this.solidColor.set(color);
    this.emitColor(color);
  }

  protected onGradientChange(gradient: string): void {
    this.gradientValue.set(gradient);
    this.emitColor(gradient);
  }

  private emitColor(value: string): void {
    this.selectedColor = value;
    this.colorChange.emit(value);
  }
}
