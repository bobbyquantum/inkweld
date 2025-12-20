import {
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
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
export interface WorldbuildingImageDialogData {
  /** Element name for display */
  elementName: string;
  /** Project username for media library access */
  username: string;
  /** Project slug for media library access */
  slug: string;
  /** Current image URL if any */
  currentImage?: string;
  /** Description for AI prompt */
  description?: string;
  /** Worldbuilding field:value pairs for AI prompt */
  worldbuildingFields?: Record<string, unknown>;
}

/**
 * Result returned from the dialog
 */
export interface WorldbuildingImageDialogResult {
  /** The image data (base64 or object URL) */
  imageData?: string;
  /** The image blob for storage */
  imageBlob?: Blob;
  /** Whether the image was removed */
  removed?: boolean;
}

@Component({
  selector: 'app-worldbuilding-image-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    ImageCropperComponent,
  ],
  templateUrl: './worldbuilding-image-dialog.component.html',
  styleUrls: ['./worldbuilding-image-dialog.component.scss'],
})
export class WorldbuildingImageDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<WorldbuildingImageDialogComponent>);
  private dialogData = inject<WorldbuildingImageDialogData>(MAT_DIALOG_DATA);
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
  elementName = '';
  username = '';
  slug = '';
  currentImageUrl?: SafeUrl;
  hasCurrentImage = false;
  description = '';
  worldbuildingFields: Record<string, unknown> = {};

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
  isLoading = false;

  // Square aspect ratio for worldbuilding images
  readonly aspectRatio = 1;

  ngOnInit(): void {
    this.elementName = this.dialogData.elementName;
    this.username = this.dialogData.username;
    this.slug = this.dialogData.slug;

    if (this.dialogData.currentImage) {
      this.currentImageUrl = this.sanitizer.bypassSecurityTrustUrl(
        this.dialogData.currentImage
      );
      this.hasCurrentImage = true;
    }

    this.description = this.dialogData.description ?? '';
    this.worldbuildingFields = this.dialogData.worldbuildingFields ?? {};
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

  /**
   * Build a prompt string from name, description, and worldbuilding fields
   */
  private buildInitialPrompt(): string {
    const parts: string[] = [];

    // Add element name
    if (this.elementName) {
      parts.push(this.elementName);
    }

    // Add description
    if (this.description) {
      parts.push(this.description);
    }

    // Add worldbuilding fields with values
    const fieldParts: string[] = [];
    for (const [key, value] of Object.entries(this.worldbuildingFields)) {
      // Skip empty values, internal fields, and timestamps
      if (
        value === null ||
        value === undefined ||
        value === '' ||
        key === 'lastModified' ||
        key.startsWith('_')
      ) {
        continue;
      }

      // Format the value
      let formattedValue: string;
      if (Array.isArray(value)) {
        formattedValue = value.filter(v => v).join(', ');
        if (!formattedValue) continue;
      } else if (typeof value === 'object') {
        continue; // Skip nested objects
      } else if (typeof value === 'string') {
        formattedValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        formattedValue = String(value);
      } else {
        continue; // Skip unsupported types
      }

      fieldParts.push(`${key}: ${formattedValue}`);
    }

    if (fieldParts.length > 0) {
      parts.push(fieldParts.join(', '));
    }

    return parts.join('. ');
  }

  async openGenerateDialog(): Promise<void> {
    const initialPrompt = this.buildInitialPrompt();

    const result = await this.dialogGateway.openImageGenerationDialog({
      forCover: false, // Not a cover, just a worldbuilding image
      prompt: initialPrompt || undefined,
    });

    if (result?.saved && result.imageData) {
      // Convert base64 to blob
      const blob = this.base64ToBlob(result.imageData);

      // Return the result directly (no cropping for AI-generated images)
      this.dialogRef.close({
        imageData: result.imageData,
        imageBlob: blob,
      } as WorldbuildingImageDialogResult);
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
    if (this.croppedBlob && this.croppedImage) {
      // Convert blob to base64 for storage
      void this.blobToBase64(this.croppedBlob).then(base64 => {
        this.dialogRef.close({
          imageData: base64,
          imageBlob: this.croppedBlob,
        } as WorldbuildingImageDialogResult);
      });
    }
  }

  cancelCropping(): void {
    this.showCropper = false;
    this.resetCropperState();
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  // --- Remove Image ---

  removeImage(): void {
    this.dialogRef.close({
      removed: true,
    } as WorldbuildingImageDialogResult);
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
