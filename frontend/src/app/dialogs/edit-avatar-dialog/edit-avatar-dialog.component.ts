import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SetupService } from '@services/core/setup.service';
import { OfflineStorageService } from '@services/offline/offline-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import {
  ImageCroppedEvent,
  ImageCropperComponent,
  LoadedImage,
} from 'ngx-image-cropper';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-edit-avatar-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    ImageCropperComponent,
  ],
  templateUrl: './edit-avatar-dialog.component.html',
  styleUrls: ['./edit-avatar-dialog.component.scss'],
})
export class EditAvatarDialogComponent {
  protected dialogRef = inject(MatDialogRef<EditAvatarDialogComponent>);
  private userService = inject(UserService);
  private unifiedUserService = inject(UnifiedUserService);
  private setupService = inject(SetupService);
  private offlineStorage = inject(OfflineStorageService);
  private sanitizer = inject(DomSanitizer);

  imageChangedEvent: Event | null = null;
  croppedImage: SafeUrl | null = null;
  croppedBlob: Blob | null = null;
  fileName = '';
  readonly isSubmitting = signal(false);
  isCropperReady = false;
  hasImageLoaded = false;
  hasLoadFailed = false;

  fileChangeEvent(event: Event): void {
    this.resetState();
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageChangedEvent = event;
      this.fileName = input.files[0].name;
    }
  }

  imageCropped(event: ImageCroppedEvent) {
    if (event.objectUrl && event.blob) {
      this.croppedImage = this.sanitizer.bypassSecurityTrustUrl(
        event.objectUrl
      );
      this.croppedBlob = event.blob;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onImageLoaded(image: LoadedImage) {
    this.hasImageLoaded = true;
  }

  onCropperReady() {
    this.isCropperReady = true;
  }

  onLoadImageFailed() {
    this.hasLoadFailed = true;
    alert('Failed to load image. Please try another file.');
  }

  resetState() {
    this.imageChangedEvent = null;
    this.croppedImage = null;
    this.croppedBlob = null;
    this.hasImageLoaded = false;
    this.isCropperReady = false;
    this.hasLoadFailed = false;
  }

  async submit(): Promise<void> {
    if (!this.croppedBlob || !this.fileName) {
      return;
    }
    this.isSubmitting.set(true);
    try {
      const mode = this.setupService.getMode();
      const username = this.unifiedUserService.currentUser()?.username;

      if (!username) {
        throw new Error('No user logged in');
      }

      if (mode === 'offline') {
        // In offline mode, save directly to IndexedDB
        await this.offlineStorage.saveUserAvatar(username, this.croppedBlob);
      } else {
        // In server mode, upload to server and cache locally
        const file = new File([this.croppedBlob], this.fileName, {
          type: this.croppedBlob.type || 'image/png',
        });
        await firstValueFrom(this.userService.uploadAvatar(file));
        // Also cache locally for offline access
        await this.offlineStorage.saveUserAvatar(username, this.croppedBlob);
      }

      // Update the current user's hasAvatar flag so avatar component reloads properly
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
