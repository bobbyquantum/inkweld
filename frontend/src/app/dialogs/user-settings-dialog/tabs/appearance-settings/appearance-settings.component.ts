import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatRadioModule } from '@angular/material/radio';
import { BackgroundPickerComponent } from '@components/background-picker/background-picker.component';
import { TranslocoModule } from '@jsverse/transloco';
import { SettingsService } from '@services/core/settings.service';

/** Geometry for one density option's miniature preview. */
interface DensityPreview {
  /** Height of the mock tab bar / sidebar header. */
  barHeight: number;
  /** Y position of each mock sidebar row. */
  rows: number[];
  /** Y position of each mock line of content. */
  lines: number[];
}

interface DensityOption {
  value: 'comfortable' | 'compact';
  /** What `SettingsService.denseLayout` holds for this option. */
  dense: boolean;
  preview: DensityPreview;
}

/** The preview viewBox. Both options are drawn at the same size. */
const PREVIEW_WIDTH = 160;
const PREVIEW_HEIGHT = 104;
const ROW_HEIGHT = 5;
const LINE_HEIGHT = 4;

/**
 * Fills the preview with as many rows as its spacing allows, which is the
 * whole point of the picture: the compact option fits more of them in the
 * same box.
 */
function stack(barHeight: number, gap: number, height: number): number[] {
  const rows: number[] = [];
  for (let y = barHeight + gap; y + height <= PREVIEW_HEIGHT - gap; y += gap) {
    rows.push(y);
  }
  return rows;
}

function preview(barHeight: number, gap: number): DensityPreview {
  return {
    barHeight,
    rows: stack(barHeight, gap, ROW_HEIGHT),
    lines: stack(barHeight, gap + 3, LINE_HEIGHT),
  };
}

/**
 * Appearance preferences: how tightly the app's chrome is packed, and the
 * background behind the signed-in surfaces.
 */
@Component({
  selector: 'app-appearance-settings',
  imports: [MatRadioModule, TranslocoModule, BackgroundPickerComponent],
  templateUrl: './appearance-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './appearance-settings.component.scss',
})
export class AppearanceSettingsComponent {
  private readonly settingsService = inject(SettingsService);

  protected readonly previewWidth = PREVIEW_WIDTH;
  protected readonly previewHeight = PREVIEW_HEIGHT;
  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly lineHeight = LINE_HEIGHT;

  protected readonly densityOptions: readonly DensityOption[] = [
    { value: 'comfortable', dense: false, preview: preview(14, 12) },
    { value: 'compact', dense: true, preview: preview(10, 9) },
  ];

  /** The selected option's `value`, so the radio group can bind to a string. */
  get density(): DensityOption['value'] {
    return this.settingsService.denseLayout() ? 'compact' : 'comfortable';
  }

  setDensity(value: DensityOption['value']): void {
    this.settingsService.setDenseLayout(value === 'compact');
  }
}
