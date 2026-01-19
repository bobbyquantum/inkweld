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
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ProjectsService } from '@inkweld/api/projects.service';
import { Project } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectService } from '@services/project/project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { nanoid } from 'nanoid';
import {
  ImageCroppedEvent,
  ImageCropperComponent,
  LoadedImage,
} from 'ngx-image-cropper';

@Component({
  selector: 'app-edit-project-dialog',
  templateUrl: './edit-project-dialog.component.html',
  styleUrls: ['./edit-project-dialog.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
    MatTooltipModule,
    ImageCropperComponent,
  ],
})
export class EditProjectDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<EditProjectDialogComponent>);
  private ProjectsService = inject(ProjectsService);
  private dialogGateway = inject(DialogGatewayService);
  private projectService = inject(ProjectService);
  private unifiedProjectService = inject(UnifiedProjectService);
  private dialogData = inject<Project>(MAT_DIALOG_DATA);
  private snackBar = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private systemConfig = inject(SystemConfigService);
  private projectState = inject(ProjectStateService);
  private localStorage = inject(LocalStorageService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('coverImageInput') coverImageInput!: ElementRef<HTMLInputElement>;

  // AI generation status - considers mode, config, and connection state
  readonly aiGenerationStatus = computed(() =>
    this.systemConfig.getAiImageGenerationStatus(
      this.projectState.getSyncState()
    )
  );

  form = new FormGroup({
    title: new FormControl('', Validators.required),
    description: new FormControl(''),
  });

  readonly isSaving = signal(false);
  readonly isLoadingCover = signal(false);
  project!: Project;
  coverImage?: Blob;
  coverImageUrl?: SafeUrl;
  private hasCoverImage = false;

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

  // Project cover aspect ratio is 2:3 (width:height) for portrait book covers
  readonly coverAspectRatio = 1 / 1.6;

  /** Track the coverMediaId for Yjs sync (separate from API cover URL) */
  private currentCoverMediaId: string | undefined;

  ngOnInit(): void {
    this.project = this.dialogData;
    console.log('dialogData: ', this.dialogData);
    console.log('Project: ', this.project);
    this.form.patchValue({
      title: this.project.title,
      description: this.project.description,
    });

    // Get coverMediaId from project state (stored in Yjs)
    this.currentCoverMediaId = this.projectState.coverMediaId();

    // Load cover image if available
    if (this.project.username && this.project.slug) {
      void this.loadCoverImage();
    }
  }

  /**
   * Load cover image - tries local storage first (offline-first), then server.
   */
  async loadCoverImage(): Promise<void> {
    this.isLoadingCover.set(true);
    const projectKey = `${this.project.username}/${this.project.slug}`;

    try {
      // First, try loading from local storage using coverMediaId
      if (this.currentCoverMediaId) {
        const localBlob = await this.localStorage.getMedia(
          projectKey,
          this.currentCoverMediaId
        );
        if (localBlob) {
          this.coverImage = localBlob;
          this.coverImageUrl = this.sanitizer.bypassSecurityTrustUrl(
            URL.createObjectURL(localBlob)
          );
          this.hasCoverImage = true;
          return;
        }
      }

      // Also try the legacy "cover" mediaId for backward compatibility
      const legacyCover = await this.localStorage.getMedia(projectKey, 'cover');
      if (legacyCover) {
        this.coverImage = legacyCover;
        this.coverImageUrl = this.sanitizer.bypassSecurityTrustUrl(
          URL.createObjectURL(legacyCover)
        );
        this.hasCoverImage = true;
        // Migrate to new coverMediaId system
        this.currentCoverMediaId = 'cover';
        return;
      }

      // Fall back to server API if local storage has nothing
      const coverBlob = await this.projectService.getProjectCover(
        this.project.username,
        this.project.slug
      );
      this.coverImage = coverBlob;
      this.coverImageUrl = this.sanitizer.bypassSecurityTrustUrl(
        URL.createObjectURL(coverBlob)
      );
      this.hasCoverImage = true;

      // Save to local storage for offline access
      const mediaId = `cover-${nanoid(8)}`;
      await this.localStorage.saveMedia(projectKey, mediaId, coverBlob);
      this.currentCoverMediaId = mediaId;
    } catch (error) {
      // Check if this is a "Cover image not found" error, which is expected
      if (error instanceof Error && error.message === 'Cover image not found') {
        // This is normal for projects without a cover image
        console.log('No cover image set for this project');
      } else {
        // Log other errors that might be unexpected
        console.warn('Error loading cover image:', error);
      }
      this.coverImage = undefined;
      this.coverImageUrl = undefined;
      this.hasCoverImage = false;
    } finally {
      this.isLoadingCover.set(false);
    }
  }

  onCoverImageSelected(event: Event): void {
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

  imageCropped(event: ImageCroppedEvent): void {
    if (event.objectUrl && event.blob) {
      this.croppedImage = this.sanitizer.bypassSecurityTrustUrl(
        event.objectUrl
      );
      this.croppedBlob = event.blob;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onImageLoaded(image: LoadedImage): void {
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
      // Create a File from the cropped blob
      const file = new File([this.croppedBlob], this.pendingFileName, {
        type: this.croppedBlob.type || 'image/png',
      });
      this.coverImage = file;
      this.coverImageUrl = this.croppedImage;
      this.showCropper = false;
      this.resetCropperState();
    }
  }

  cancelCropping(): void {
    this.showCropper = false;
    this.resetCropperState();
    // Reset the file input
    if (this.coverImageInput) {
      this.coverImageInput.nativeElement.value = '';
    }
  }

  openCoverImageSelector(): void {
    this.coverImageInput.nativeElement.click();
  }

  async openMediaLibrarySelector(): Promise<void> {
    if (!this.project.username || !this.project.slug) return;

    const result = await this.dialogGateway.openMediaSelectorDialog({
      username: this.project.username,
      slug: this.project.slug,
      filterType: 'image',
      title: 'Select Cover Image',
    });

    if (result?.blob) {
      // Convert blob to base64 for the cropper
      const base64 = await this.blobToBase64(result.blob);
      const filename = result.selected?.filename || 'selected-cover.png';

      // Reset cropper state first
      this.resetCropperState();

      // Set the data BEFORE showing the cropper
      this.pendingFileName = filename;
      this.imageBase64 = base64;

      // Show the cropper and trigger change detection
      this.showCropper = true;
      this.cdr.detectChanges();
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async openGenerateCoverDialog(): Promise<void> {
    const result = await this.dialogGateway.openImageGenerationDialog({
      forCover: true,
    });
    if (result?.saved && result.imageData) {
      // Show the cropper to let user crop the generated image to the correct cover dimensions
      // Reset cropper state first
      this.resetCropperState();

      // Set the data BEFORE showing the cropper
      this.pendingFileName = 'generated-cover.png';

      // The imageData from the dialog is a data URL (data:image/png;base64,...)
      // ngx-image-cropper's imageBase64 expects just the base64 string without the prefix
      // However, it also accepts the full data URL, so we pass it directly
      this.imageBase64 = result.imageData;

      // Show the cropper and trigger change detection
      this.showCropper = true;
      this.cdr.detectChanges();
    }
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

  async removeCoverImage(): Promise<void> {
    if (!this.project.username || !this.project.slug) return;

    this.isLoadingCover.set(true);
    const projectKey = `${this.project.username}/${this.project.slug}`;

    try {
      // Delete from local storage first (offline-first)
      if (this.currentCoverMediaId) {
        await this.localStorage.deleteMedia(
          projectKey,
          this.currentCoverMediaId
        );
      }

      // Try to delete from server (best effort)
      try {
        await this.projectService.deleteProjectCover(
          this.project.username,
          this.project.slug
        );
      } catch (serverError) {
        // Log but don't fail - local storage is the source of truth
        console.warn(
          'Failed to delete cover from server (will sync later):',
          serverError
        );
      }

      // Clear local state
      this.coverImage = undefined;
      this.coverImageUrl = undefined;
      this.hasCoverImage = false;
      this.currentCoverMediaId = undefined;

      // Update project state to clear coverMediaId via Yjs
      const currentProject = this.projectState.project();
      if (currentProject) {
        this.projectState.updateProject(currentProject, '');
      }

      this.showSuccess('Cover image removed successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.showError(`Failed to remove cover image: ${errorMessage}`);
    } finally {
      this.isLoadingCover.set(false);
    }
  }

  private isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    return validTypes.includes(file.type);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) return;

    this.isSaving.set(true);
    try {
      interface FormValues {
        title: string;
        description: string;
      }

      const formValues = this.form.value as FormValues;
      const updatedProject: Project = {
        ...this.project,
        title: formValues.title,
        description: formValues.description,
      };

      if (!updatedProject.slug) {
        throw new Error('Project slug is required');
      }

      const projectKey = `${updatedProject.username}/${updatedProject.slug}`;

      // Handle cover image - save to local storage first (offline-first)
      let newCoverMediaId = this.currentCoverMediaId;
      if (
        this.coverImage instanceof File &&
        updatedProject.username &&
        updatedProject.slug
      ) {
        // Generate new mediaId and save locally
        newCoverMediaId = `cover-${nanoid(8)}`;
        await this.localStorage.saveMedia(
          projectKey,
          newCoverMediaId,
          this.coverImage
        );
        this.currentCoverMediaId = newCoverMediaId;

        // Try to upload to server (best effort - don't fail if server unreachable)
        try {
          await this.projectService.uploadProjectCover(
            updatedProject.username,
            updatedProject.slug,
            this.coverImage
          );
        } catch (imageError) {
          // Log but don't fail - local storage is the source of truth
          console.warn(
            'Failed to upload cover to server (will sync later):',
            imageError
          );
        }
      }

      // Use UnifiedProjectService for update - handles both online and offline modes
      const response = await this.unifiedProjectService.updateProject(
        updatedProject.username,
        updatedProject.slug,
        {
          title: updatedProject.title,
          description: updatedProject.description,
        }
      );

      // Update project state with coverMediaId for Yjs sync
      this.projectState.updateProject(response, newCoverMediaId);

      this.showSuccess('Project updated successfully');
      this.dialogRef.close(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to update project:', errorMessage);
      this.showError(`Failed to update project: ${errorMessage}`);
    } finally {
      this.isSaving.set(false);
    }
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar'],
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar'],
    });
  }
}
