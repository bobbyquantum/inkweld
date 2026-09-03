import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { BackgroundService } from '@services/core/background.service';

import { BACKGROUND_PRESETS } from '../../config/background-presets';

/** Client-side guard mirroring the backend's cap, for a fast, clear error. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/**
 * Lets a user choose the background for the signed-in surfaces: the site
 * default, one of the built-in presets, or their own uploaded image when the
 * admin allows it.
 *
 * Renders nothing at all when personalisation is disabled, so it can be dropped
 * into settings unconditionally.
 */
@Component({
  selector: 'app-background-picker',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './background-picker.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './background-picker.component.scss',
})
export class BackgroundPickerComponent implements OnInit {
  private readonly backgroundService = inject(BackgroundService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly presets = BACKGROUND_PRESETS;
  readonly isBusy = signal(false);

  readonly enabled = this.backgroundService.userBackgroundEnabled;
  readonly uploadEnabled = this.backgroundService.userBackgroundUploadEnabled;
  readonly hasUpload = this.backgroundService.hasUpload;

  private readonly preference = this.backgroundService.preference;

  /** Which tile is selected: `default`, `upload`, or a preset id. */
  readonly selection = computed(() => {
    const preference = this.preference();
    if (preference.kind === 'preset' && preference.presetId) {
      return preference.presetId;
    }
    return preference.kind;
  });

  /** CSS `background-image` for the "my image" tile. */
  readonly uploadPreview = computed(() =>
    this.hasUpload()
      ? `url("${this.backgroundService.userBackgroundUrl()}")`
      : 'none'
  );

  ngOnInit(): void {
    // The dialog can open before the home page has resolved authentication, so
    // make sure we have the config and preference this picker reflects.
    void this.backgroundService.refresh({ authenticated: true });
  }

  async selectDefault(): Promise<void> {
    await this.save({ kind: 'default' });
  }

  async selectPreset(presetId: string): Promise<void> {
    await this.save({ kind: 'preset', presetId });
  }

  async selectUpload(): Promise<void> {
    if (!this.hasUpload()) {
      return;
    }
    await this.save({ kind: 'upload' });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear immediately so re-picking the same file fires a fresh change event.
    input.value = '';
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      this.notify('settings.background.invalidType');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      this.notify('settings.background.tooLarge');
      return;
    }

    this.isBusy.set(true);
    try {
      await this.backgroundService.uploadUserBackground(file, file.name);
      this.notify('settings.background.uploaded');
    } catch {
      this.notify('settings.background.uploadFailed');
    } finally {
      this.isBusy.set(false);
    }
  }

  async removeUpload(): Promise<void> {
    this.isBusy.set(true);
    try {
      await this.backgroundService.deleteUserBackground();
      this.notify('settings.background.removed');
    } catch {
      this.notify('settings.background.removeFailed');
    } finally {
      this.isBusy.set(false);
    }
  }

  private async save(preference: {
    kind: 'default' | 'preset' | 'upload';
    presetId?: string;
  }): Promise<void> {
    this.isBusy.set(true);
    try {
      await this.backgroundService.setPreference(preference);
    } catch {
      this.notify('settings.background.saveFailed');
      // The optimistic apply may now disagree with the server, so re-read.
      await this.backgroundService.refresh({ authenticated: true });
    } finally {
      this.isBusy.set(false);
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), undefined, {
      duration: 3000,
    });
  }
}
