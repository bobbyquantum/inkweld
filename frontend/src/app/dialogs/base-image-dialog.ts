import {
  computed,
  Directive,
  type ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { ProjectStateService } from '@services/project/project-state.service';
import type { ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';

import { base64ToBlob } from '../utils/base64-utils';

/**
 * Abstract base class for image selection/cropping dialogs.
 * Provides shared services, cropper state management, file upload,
 * media library, and utility methods.
 */
@Directive()
export abstract class BaseImageDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef);
  protected readonly dialogGateway = inject(DialogGatewayService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly sanitizer = inject(DomSanitizer);
  protected readonly systemConfig = inject(SystemConfigService);
  protected readonly projectState = inject(ProjectStateService);
  protected readonly transloco = inject(TranslocoService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly aiGenerationStatus = computed(() =>
    this.systemConfig.getAiImageGenerationStatus(
      this.projectState.getSyncState()
    )
  );

  // Common dialog data
  username = '';
  slug = '';
  description = '';

  // Image cropper state
  readonly imageChangedEvent = signal<Event | null>(null);
  readonly imageBase64 = signal<string | undefined>(undefined);
  readonly croppedImage = signal<SafeUrl | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly isCropperReady = signal(false);
  readonly hasImageLoaded = signal(false);
  readonly hasLoadFailed = signal(false);
  readonly showCropper = signal(false);
  readonly pendingFileName = signal('');
  readonly isLoading = signal(false);

  abstract readonly aspectRatio: number;

  // --- File Upload ---

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (this.isValidImageFile(file)) {
        this.resetCropperState();
        this.imageChangedEvent.set(event);
        this.pendingFileName.set(file.name);
        this.showCropper.set(true);
      } else {
        this.showError(
          this.transloco.translate('dialogs.baseImage.invalidImage')
        );
      }
    }
  }

  private isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    return validTypes.includes(file.type);
  }

  openFileSelector(): void {
    this.fileInput.nativeElement.click();
  }

  // --- Media Library ---

  async openMediaLibrary(): Promise<void> {
    const result = await this.dialogGateway.openMediaSelectorDialog({
      username: this.username,
      slug: this.slug,
      filterType: 'image',
      title: 'Select Image',
    });

    if (result?.blob) {
      const base64 = await this.blobToBase64(result.blob);
      const filename = result.selected?.filename || 'selected-image.png';

      this.resetCropperState();
      this.pendingFileName.set(filename);
      this.imageBase64.set(base64);
      this.showCropper.set(true);
    }
  }

  // --- AI Generation ---

  abstract openGenerateDialog(): Promise<void>;

  /**
   * Extract a Blob from AI-generated image data (base64, data URL, or HTTP URL).
   */
  protected async extractImageBlob(imageData: string): Promise<Blob> {
    if (imageData.startsWith('data:') || imageData.startsWith('blob:')) {
      return base64ToBlob(imageData);
    } else if (
      imageData.startsWith('http://') ||
      imageData.startsWith('https://') ||
      imageData.startsWith('media://')
    ) {
      const fetchResponse = await fetch(imageData);
      return fetchResponse.blob();
    } else {
      return base64ToBlob(imageData);
    }
  }

  // --- Image Cropper ---

  imageCropped(event: ImageCroppedEvent): void {
    if (event.objectUrl && event.blob) {
      this.croppedImage.set(
        this.sanitizer.bypassSecurityTrustUrl(event.objectUrl) // NOSONAR — URL from ngx-image-cropper output
      );
      this.croppedBlob.set(event.blob);
    }
  }

  onImageLoaded(_image: LoadedImage): void {
    this.hasImageLoaded.set(true);
  }

  onCropperReady(): void {
    this.isCropperReady.set(true);
  }

  onLoadImageFailed(): void {
    this.hasLoadFailed.set(true);
    this.showCropper.set(false);
    this.showError(this.transloco.translate('dialogs.baseImage.loadFailed'));
  }

  resetCropperState(): void {
    this.imageChangedEvent.set(null);
    this.imageBase64.set(undefined);
    this.croppedImage.set(null);
    this.croppedBlob.set(null);
    this.hasImageLoaded.set(false);
    this.isCropperReady.set(false);
    this.hasLoadFailed.set(false);
    this.pendingFileName.set('');
  }

  abstract applyCroppedImage(): void;

  cancelCropping(): void {
    this.showCropper.set(false);
    this.resetCropperState();
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // --- Cancel ---

  cancel(): void {
    this.dialogRef.close();
  }

  // --- Helpers ---

  protected blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  protected showError(message: string): void {
    this.snackBar.open(message, this.transloco.translate('close'), {
      duration: 5000,
    });
  }
}
