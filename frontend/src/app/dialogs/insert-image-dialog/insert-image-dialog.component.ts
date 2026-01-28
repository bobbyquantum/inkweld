import {
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  ImageCroppedEvent,
  ImageCropperComponent,
  LoadedImage,
} from 'ngx-image-cropper';

/**
 * Data passed to the dialog
 */
export interface InsertImageDialogData {
  /** Project username for media library access */
  username: string;
  /** Project slug for media library access */
  slug: string;
  /** Optional description for AI prompt */
  description?: string;
}

/**
 * Result returned from the dialog
 */
export interface InsertImageDialogResult {
  /** The media ID for insertion (e.g., "img-xxx") */
  mediaId: string;
  /** The image blob for storage */
  imageBlob: Blob;
}

@Component({
  selector: 'app-insert-image-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    ImageCropperComponent,
  ],
  templateUrl: './insert-image-dialog.component.html',
  styleUrls: ['./insert-image-dialog.component.scss'],
})
export class InsertImageDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<InsertImageDialogComponent>);
  private dialogData = inject<InsertImageDialogData>(MAT_DIALOG_DATA);
  private dialogGateway = inject(DialogGatewayService);
  private snackBar = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private systemConfig = inject(SystemConfigService);
  private projectState = inject(ProjectStateService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // AI generation status - considers mode, config, and connection state
  readonly aiGenerationStatus = computed(() =>
    this.systemConfig.getAiImageGenerationStatus(
      this.projectState.getSyncState()
    )
  );

  // Dialog data
  username = '';
  slug = '';
  description = '';

  // Image cropper properties
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

  // Free aspect ratio for document images (no fixed ratio)
  readonly aspectRatio = 0;
  readonly maintainAspectRatio = false;

  ngOnInit(): void {
    this.username = this.dialogData.username;
    this.slug = this.dialogData.slug;
    this.description = this.dialogData.description ?? '';
  }

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
      // Convert blob to base64 for the cropper
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

  async openGenerateDialog(): Promise<void> {
    const result = await this.dialogGateway.openImageGenerationDialog({
      forCover: false,
      prompt: this.description || undefined,
    });

    if (!result) {
      return; // Dialog cancelled
    }

    if (result.saved && result.imageData) {
      try {
        let blob: Blob;

        // Handle both base64 and URL data
        if (
          result.imageData.startsWith('data:') ||
          result.imageData.startsWith('blob:')
        ) {
          blob = this.base64ToBlob(result.imageData);
        } else if (
          result.imageData.startsWith('http://') ||
          result.imageData.startsWith('https://') ||
          result.imageData.startsWith('media://')
        ) {
          const fetchResponse = await fetch(result.imageData);
          blob = await fetchResponse.blob();
        } else {
          blob = this.base64ToBlob(result.imageData);
        }

        // Convert blob to base64 for cropper
        const base64 = await this.blobToBase64(blob);

        this.resetCropperState();
        this.pendingFileName = 'ai-generated-image.png';
        this.imageBase64 = base64;
        this.showCropper = true;
        this.cdr.detectChanges();
      } catch (err) {
        console.error('[InsertImageDialog] Failed to process image:', err);
        this.showError('Failed to process generated image. Please try again.');
      }
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

  applyCroppedImage(): void {
    if (this.croppedBlob) {
      // Generate a unique media ID
      const mediaId = `img-${crypto.randomUUID()}`;

      this.dialogRef.close({
        mediaId,
        imageBlob: this.croppedBlob,
      } as InsertImageDialogResult);
    }
  }

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

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(base64Data: string): Blob {
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'image/png' });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 5000 });
  }
}
