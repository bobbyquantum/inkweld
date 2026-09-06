import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ProfileAppearance } from '@inkweld/model/profile-appearance';
import {
  type ProfileBackground,
  ProfileBackgroundKind,
  type ProfileBackgroundPresetId,
} from '@inkweld/model/profile-background';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { UserProfileService } from '@services/user/user-profile.service';
import {
  type ImageCroppedEvent,
  ImageCropperComponent,
} from 'ngx-image-cropper';
import { firstValueFrom } from 'rxjs';

import { BACKGROUND_PRESETS } from '../../config/background-presets';

export interface ProfileAppearanceDialogData {
  username: string;
  appearance: ProfileAppearance;
}

/** Client-side guard mirroring the backend's cap, for a fast, clear error. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** Banners are cropped to this ratio; the page renders them the same way. */
export const BANNER_ASPECT_RATIO = 3;

/**
 * Lets a user dress their own profile page: a banner image across the top of
 * the card, and a backdrop for the page (plain, or one of the built-in
 * presets — everyone who can see the profile sees the choice, so unlike the
 * app background there is no "my uploaded image" option here).
 *
 * Every change is saved as it is made, like the app background picker; the
 * dialog closes with `true` when anything changed so the page can reload.
 */
@Component({
  selector: 'app-profile-appearance-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    ImageCropperComponent,
  ],
  templateUrl: './profile-appearance-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './profile-appearance-dialog.component.scss',
})
export class ProfileAppearanceDialogComponent {
  protected readonly dialogRef = inject(
    MatDialogRef<ProfileAppearanceDialogComponent, boolean>
  );
  protected readonly data =
    inject<ProfileAppearanceDialogData>(MAT_DIALOG_DATA);
  private readonly profileService = inject(UserProfileService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly bannerAspectRatio = BANNER_ASPECT_RATIO;

  /**
   * Presets offered as a page backdrop. `none` is dropped because "Plain" is
   * the same thing with a clearer name for this context.
   */
  readonly presets = BACKGROUND_PRESETS.filter(preset => preset.id !== 'none');

  readonly background = signal<ProfileBackground>(
    this.data.appearance.background
  );
  readonly hasBanner = signal(this.data.appearance.hasBanner);
  /** Bumped after each upload so the preview `<img>` re-fetches. */
  readonly bannerVersion = signal(0);
  readonly isBusy = signal(false);

  readonly imageChangedEvent = signal<Event | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly fileName = signal('');

  /** Whether anything was saved, for the close result. */
  private changed = false;

  /** Which tile is selected: `plain` or a preset id. */
  readonly selection = computed(() => {
    const background = this.background();
    return background.kind === ProfileBackgroundKind.Preset &&
      background.presetId
      ? background.presetId
      : ProfileBackgroundKind.Plain;
  });

  readonly bannerPreviewUrl = computed(() =>
    this.hasBanner()
      ? this.profileService.bannerUrl(this.data.username, this.bannerVersion())
      : null
  );

  async selectPlain(): Promise<void> {
    await this.saveBackground({ kind: ProfileBackgroundKind.Plain });
  }

  async selectPreset(presetId: string): Promise<void> {
    await this.saveBackground({
      kind: ProfileBackgroundKind.Preset,
      presetId: presetId as ProfileBackgroundPresetId,
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      input.value = '';
      this.notify('settings.profilePage.appearance.invalidType');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      input.value = '';
      this.notify('settings.profilePage.appearance.tooLarge');
      return;
    }

    // The cropper reads the file from the event, so the input keeps its value
    // until the crop is done.
    this.croppedBlob.set(null);
    this.fileName.set(file.name);
    this.imageChangedEvent.set(event);
  }

  onImageCropped(event: ImageCroppedEvent): void {
    if (event.blob) {
      this.croppedBlob.set(event.blob);
    }
  }

  onLoadImageFailed(): void {
    this.resetCropper();
    this.notify('settings.profilePage.appearance.invalidType');
  }

  async uploadBanner(): Promise<void> {
    const blob = this.croppedBlob();
    if (!blob) {
      return;
    }
    this.isBusy.set(true);
    try {
      await firstValueFrom(
        this.profileService.uploadBanner(blob, this.fileName() || 'banner.jpg')
      );
      this.changed = true;
      this.hasBanner.set(true);
      this.bannerVersion.update(v => v + 1);
      this.resetCropper();
      this.notify('settings.profilePage.appearance.bannerUploaded');
    } catch {
      this.notify('settings.profilePage.appearance.bannerUploadFailed');
    } finally {
      this.isBusy.set(false);
    }
  }

  async removeBanner(): Promise<void> {
    this.isBusy.set(true);
    try {
      await firstValueFrom(this.profileService.deleteBanner());
      this.changed = true;
      this.hasBanner.set(false);
      this.notify('settings.profilePage.appearance.bannerRemoved');
    } catch {
      this.notify('settings.profilePage.appearance.bannerRemoveFailed');
    } finally {
      this.isBusy.set(false);
    }
  }

  close(): void {
    this.dialogRef.close(this.changed);
  }

  private resetCropper(): void {
    this.imageChangedEvent.set(null);
    this.croppedBlob.set(null);
    this.fileName.set('');
  }

  private async saveBackground(background: ProfileBackground): Promise<void> {
    const previous = this.background();
    // Optimistic: the tile should highlight as soon as it is clicked.
    this.background.set(background);
    this.isBusy.set(true);
    try {
      const saved = await firstValueFrom(
        this.profileService.setProfileBackground(background)
      );
      this.background.set(saved);
      this.changed = true;
    } catch {
      this.background.set(previous);
      this.notify('settings.profilePage.appearance.saveFailed');
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
