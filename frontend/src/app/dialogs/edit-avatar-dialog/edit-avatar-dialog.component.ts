import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { SetupService } from '@services/core/setup.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import {
  type ImageCroppedEvent,
  ImageCropperComponent,
  type LoadedImage,
} from 'ngx-image-cropper';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-edit-avatar-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    TranslocoModule,
    ImageCropperComponent,
  ],
  templateUrl: './edit-avatar-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./edit-avatar-dialog.component.scss'],
})
export class EditAvatarDialogComponent {
  protected dialogRef = inject(MatDialogRef<EditAvatarDialogComponent>);
  private readonly userService = inject(UserService);
  private readonly unifiedUserService = inject(UnifiedUserService);
  private readonly setupService = inject(SetupService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly transloco = inject(TranslocoService);

  readonly imageChangedEvent = signal<Event | null>(null);
  readonly croppedImage = signal<SafeUrl | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly fileName = signal('');
  readonly isSubmitting = signal(false);
  readonly isCropperReady = signal(false);
  readonly hasImageLoaded = signal(false);
  readonly hasLoadFailed = signal(false);

  fileChangeEvent(event: Event): void {
    this.resetState();
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageChangedEvent.set(event);
      this.fileName.set(input.files[0].name);
    }
  }

  imageCropped(event: ImageCroppedEvent) {
    if (event.objectUrl && event.blob) {
      this.croppedImage.set(
        this.sanitizer.bypassSecurityTrustUrl(event.objectUrl) // NOSONAR — URL from ngx-image-cropper output
      );
      this.croppedBlob.set(event.blob);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onImageLoaded(image: LoadedImage) {
    this.hasImageLoaded.set(true);
  }

  onCropperReady() {
    this.isCropperReady.set(true);
  }

  onLoadImageFailed() {
    this.hasLoadFailed.set(true);
    alert(this.transloco.translate('dialogs.baseImage.loadFailed'));
  }

  resetState() {
    this.imageChangedEvent.set(null);
    this.croppedImage.set(null);
    this.croppedBlob.set(null);
    this.hasImageLoaded.set(false);
    this.isCropperReady.set(false);
    this.hasLoadFailed.set(false);
  }

  async submit(): Promise<void> {
    if (!this.croppedBlob() || !this.fileName()) {
      return;
    }
    this.isSubmitting.set(true);
    try {
      const mode = this.setupService.getMode();
      const username = this.unifiedUserService.currentUser()?.username;

      if (!username) {
        throw new Error('No user logged in');
      }

      const blob = this.croppedBlob()!;

      if (mode === 'local') {
        await this.localStorage.saveUserAvatar(username, blob);
      } else {
        const file = new File([blob], this.fileName(), {
          type: blob.type || 'image/png',
        });
        await firstValueFrom(this.userService.uploadAvatar(file));
        await this.localStorage.saveUserAvatar(username, blob);
      }

      const currentUser = this.unifiedUserService.currentUser();
      if (currentUser) {
        await this.userService.setCurrentUser({
          ...currentUser,
          hasAvatar: true,
        });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
