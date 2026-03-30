import {
  ChangeDetectorRef,
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
  protected readonly cdr = inject(ChangeDetectorRef);
  protected readonly systemConfig = inject(SystemConfigService);
  protected readonly projectState = inject(ProjectStateService);

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
  imageChangedEvent: Event | null = null;
  imageBase64: string | undefined = undefined;
  croppedImage: SafeUrl | null = null;
  croppedBlob: Blob | null = null;
  isCropperReady = false;
  hasImageLoaded = false;
  hasLoadFailed = false;
  showCropper = false;
  pendingFileName = '';
  readonly isLoading = signal(false);

  abstract readonly aspectRatio: number;

  // --- File Upload ---

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (this.isValidImageFile(file)) {
        this.resetCropperState();
        this.imageChangedEvent = event;
        this.pendingFileName = file.name;
        this.showCropper = true;
      } else {
        this.showError('Invalid image file. Please select a JPEG or PNG file.');
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
      this.pendingFileName = filename;
      this.imageBase64 = base64;
      this.showCropper = true;
      this.cdr.detectChanges();
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
      this.croppedImage = this.sanitizer.bypassSecurityTrustUrl(
        event.objectUrl
      );
      this.croppedBlob = event.blob;
    }
  }

  onImageLoaded(_image: LoadedImage): void {
    this.hasImageLoaded = true;
  }

  onCropperReady(): void {
    this.isCropperReady = true;
  }

  onLoadImageFailed(): void {
    this.hasLoadFailed = true;
    this.showCropper = false;
    this.showError('Failed to load image. Please try another file.');
  }

  resetCropperState(): void {
    this.imageChangedEvent = null;
    this.imageBase64 = undefined;
    this.croppedImage = null;
    this.croppedBlob = null;
    this.hasImageLoaded = false;
    this.isCropperReady = false;
    this.hasLoadFailed = false;
    this.pendingFileName = '';
  }

  abstract applyCroppedImage(): void;

  cancelCropping(): void {
    this.showCropper = false;
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
    this.snackBar.open(message, 'Close', { duration: 5000 });
  }
}
