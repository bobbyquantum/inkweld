import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';
import { TranslocoModule } from '@jsverse/transloco';
import {
  type CanvasPageSettings,
  DARK_PAGE,
  defaultPageSettings,
  FRAME_PRESETS,
  type FramePresetKey,
  isDarkBackground,
  LIGHT_PAGE,
} from '@models/canvas.model';
import { ThemeService } from '@themes/theme.service';

/** Canvas size choices: a preset, a custom size, or no page frame at all. */
export type CanvasSizeChoice = FramePresetKey | 'custom' | 'none';

export interface CanvasSetupDialogData {
  /**
   * `create` also asks for the canvas size and starts from colours matching
   * the current theme; `edit` only changes the colours of an existing canvas.
   */
  mode: 'create' | 'edit';
  /** Current page colours (edit mode). */
  page?: CanvasPageSettings;
  /** Pre-selected canvas size (create mode). Defaults to `none`. */
  size?: CanvasSizeChoice;
  /** Whether the size may be changed (a cover canvas is always cover-sized). */
  sizeLocked?: boolean;
}

export interface CanvasSetupDialogResult {
  page: CanvasPageSettings;
  /** Canvas-size frame to create, when one was chosen (create mode only). */
  frame?: { width: number; height: number };
}

/** Smallest sensible frame edge in canvas units. */
const MIN_FRAME_SIZE = 16;

/**
 * Asks what a canvas should look like before (or after) it exists: page
 * colour, default ink and — when creating — its size. Page colours are
 * document state, fixed for every collaborator regardless of theme, so this
 * is where the theme gets a say: the starting colours match what the creator
 * is looking at.
 */
@Component({
  selector: 'app-canvas-setup-dialog',
  templateUrl: './canvas-setup-dialog.component.html',
  styleUrls: ['./canvas-setup-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasSetupDialogComponent {
  protected readonly data = inject<CanvasSetupDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<CanvasSetupDialogComponent, CanvasSetupDialogResult>
  );
  private readonly themeService = inject(ThemeService);

  protected readonly isCreate = this.data.mode === 'create';
  protected readonly presets = FRAME_PRESETS;

  private readonly initialPage: CanvasPageSettings =
    this.data.page ?? defaultPageSettings(this.themeService.isDarkMode());

  protected readonly background = signal(this.initialPage.background);
  protected readonly inkColor = signal(this.initialPage.inkColor);
  protected readonly size = signal<CanvasSizeChoice>(this.data.size ?? 'none');
  protected readonly customWidth = signal('1000');
  protected readonly customHeight = signal('1000');

  /** Whether the current ink would be hard to see on the current page. */
  protected readonly lowContrast = computed(
    () =>
      isDarkBackground(this.background()) === isDarkBackground(this.inkColor())
  );

  protected readonly frameSize = computed<
    { width: number; height: number } | undefined
  >(() => {
    const choice = this.size();
    if (choice === 'none' || !this.isCreate) return undefined;
    if (choice === 'custom') {
      return {
        width: CanvasSetupDialogComponent.parseSize(this.customWidth()),
        height: CanvasSetupDialogComponent.parseSize(this.customHeight()),
      };
    }
    const preset = FRAME_PRESETS.find(p => p.key === choice);
    return preset ? { width: preset.width, height: preset.height } : undefined;
  });

  protected readonly customInvalid = computed(() => {
    const frame = this.frameSize();
    return (
      this.size() === 'custom' &&
      (!frame || frame.width < MIN_FRAME_SIZE || frame.height < MIN_FRAME_SIZE)
    );
  });

  /** Quick picks: a light page with dark ink, or the reverse. */
  protected usePreset(dark: boolean): void {
    const page = dark ? DARK_PAGE : LIGHT_PAGE;
    this.background.set(page.background);
    this.inkColor.set(page.inkColor);
  }

  protected onBackgroundChange(color: string): void {
    this.background.set(color);
  }

  protected onInkChange(color: string): void {
    this.inkColor.set(color);
  }

  protected onCancel(): void {
    this.dialogRef.close();
  }

  protected onConfirm(): void {
    if (this.customInvalid()) return;
    const result: CanvasSetupDialogResult = {
      page: { background: this.background(), inkColor: this.inkColor() },
    };
    const frame = this.frameSize();
    if (frame) result.frame = frame;
    this.dialogRef.close(result);
  }

  private static parseSize(raw: string): number {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }
}
