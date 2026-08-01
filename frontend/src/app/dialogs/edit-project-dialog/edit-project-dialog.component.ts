import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, type SafeUrl } from '@angular/platform-browser';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Project } from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectService } from '@services/project/project.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  type ImageCroppedEvent,
  ImageCropperComponent,
  type LoadedImage,
} from 'ngx-image-cropper';

interface EditProjectFormValue {
  title: string;
  description: string;
}

@Component({
  selector: 'app-edit-project-dialog',
  templateUrl: './edit-project-dialog.component.html',
  styleUrls: ['./edit-project-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoModule,
    ImageCropperComponent,
  ],
  host: { 'data-testid': 'edit-project-dialog' },
})
export class EditProjectDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<EditProjectDialogComponent>);
  private readonly ProjectsService = inject(ProjectsService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly projectService = inject(ProjectService);
  private readonly unifiedProjectService = inject(UnifiedProjectService);
  private readonly dialogData = inject<Project>(MAT_DIALOG_DATA);
  private readonly snackBar = inject(MatSnackBar);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly projectState = inject(ProjectStateService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);
  private readonly transloco = inject(TranslocoService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('coverImageInput') coverImageInput!: ElementRef<HTMLInputElement>;

  // AI generation status - considers mode, config, and connection state
  readonly aiGenerationStatus = computed(() =>
    this.systemConfig.getAiImageGenerationStatus(
      this.projectState.getSyncState()
    )
  );

  readonly model = signal<EditProjectFormValue>({
    title: '',
    description: '',
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.title, {
      message: this.transloco.translate('dialogs.editProject.titleRequired'),
    });
  });

  readonly isSaving = signal(false);
  readonly isLoadingCover = signal(false);
  project!: Project;
  coverImage?: Blob;
  coverImageUrl?: SafeUrl;
  private hasCoverImage = false;

  // Image cropper state. The template-bound properties MUST be signals: the
  // app is zoneless, and the media-library / AI-generation flows assign them
  // from async continuations (after `await`). Plain property writes there
  // never schedule change detection, so the cropper view silently never
  // appears. (The file-upload flow only worked because template event
  // bindings schedule change detection themselves.)
  readonly imageChangedEvent = signal<Event | null>(null);
  readonly imageBase64 = signal<string | undefined>(undefined);
  readonly croppedImage = signal<SafeUrl | null>(null);
  readonly croppedBlob = signal<Blob | null>(null);
  readonly showCropper = signal(false);
  isCropperReady = false;
  hasImageLoaded = false;
  hasLoadFailed = false;
  pendingFileName = '';

  // Project cover aspect ratio is 2:3 (width:height) for portrait book covers
  readonly coverAspectRatio = 1 / 1.6;

  /** Track the coverMediaId for Yjs sync (separate from API cover URL) */
  private currentCoverMediaId: string | undefined;

  ngOnInit(): void {
    this.project = this.dialogData;

    this.model.set({
      title: this.project.title,
      description: this.project.description ?? '',
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

      // Save to local storage for offline access using the project's coverImage filename stem
      const mediaId = this.project.coverImage
        ? this.project.coverImage.replace(/\.[^.]+$/, '')
        : `cover-${Date.now()}`;
      await this.localStorage.saveMedia(projectKey, mediaId, coverBlob);
      this.currentCoverMediaId = mediaId;
    } catch (error) {
      // Check if this is a "Cover image not found" error, which is expected
      if (error instanceof Error && error.message === 'Cover image not found') {
        // This is normal for projects without a cover image
        this.logger.debug(
          'EditProjectDialog',
          'No cover image set for this project'
        );
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
        this.imageChangedEvent.set(event);
        this.pendingFileName = file.name;
        this.showCropper.set(true);
      } else {
        this.showError(
          this.transloco.translate('dialogs.editProject.invalidImage')
        );
      }
    }
  }

  imageCropped(event: ImageCroppedEvent): void {
    if (event.objectUrl && event.blob) {
      this.croppedImage.set(
        this.sanitizer.bypassSecurityTrustUrl(event.objectUrl)
      );
      this.croppedBlob.set(event.blob);
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
    this.showCropper.set(false);
    this.showError(this.transloco.translate('dialogs.editProject.loadFailed'));
  }

  resetCropperState(): void {
    this.imageChangedEvent.set(null);
    this.imageBase64.set(undefined);
    this.croppedImage.set(null);
    this.croppedBlob.set(null);
    this.hasImageLoaded = false;
    this.isCropperReady = false;
    this.hasLoadFailed = false;
    this.pendingFileName = '';
  }

  applyCroppedImage(): void {
    const croppedBlob = this.croppedBlob();
    const croppedImage = this.croppedImage();
    if (croppedBlob && croppedImage) {
      // Create a File from the cropped blob
      const file = new File([croppedBlob], this.pendingFileName, {
        type: croppedBlob.type || 'image/png',
      });
      this.coverImage = file;
      this.coverImageUrl = croppedImage;
      this.showCropper.set(false);
      this.resetCropperState();
    }
  }

  cancelCropping(): void {
    this.showCropper.set(false);
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

      // Reset cropper state first, then set the data BEFORE showing the
      // cropper. Signal writes schedule change detection in zoneless mode —
      // without them this async continuation never re-renders the template.
      this.resetCropperState();
      this.pendingFileName = filename;
      this.imageBase64.set(base64);
      this.showCropper.set(true);
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
    if (result?.saved && !result.imageData) {
      // Never fail silently: the dialog claims success but produced no
      // usable image payload (e.g. provider returned a URL that couldn't
      // be resolved to data).
      this.showError(
        this.transloco.translate('dialogs.editProject.loadFailed')
      );
      return;
    }
    if (result?.saved && result.imageData) {
      // Show the cropper to let user crop the generated image to the correct
      // cover dimensions. Signal writes schedule change detection in zoneless
      // mode — without them this async continuation never re-renders.
      this.resetCropperState();
      this.pendingFileName = 'generated-cover.png';

      // The imageData from the dialog is a data URL (data:image/png;base64,...)
      // ngx-image-cropper's imageBase64 expects just the base64 string without the prefix
      // However, it also accepts the full data URL, so we pass it directly
      this.imageBase64.set(result.imageData);
      this.showCropper.set(true);
    }
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

      this.showSuccess(
        this.transloco.translate('dialogs.editProject.coverRemoved')
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.showError(
        this.transloco.translate('dialogs.editProject.coverRemoveFailed', {
          error: errorMessage,
        })
      );
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
    if (this.form().invalid()) return;

    this.isSaving.set(true);
    try {
      const formValues = this.model();
      const updatedProject: Project = {
        ...this.project,
        title: formValues.title,
        description: formValues.description,
      };

      if (!updatedProject.slug) {
        throw new Error('Project slug is required');
      }

      // Handle cover image upload
      let newCoverMediaId = this.currentCoverMediaId;
      if (
        this.coverImage instanceof File &&
        updatedProject.username &&
        updatedProject.slug
      ) {
        // Upload to server — returns the unique cover filename (e.g. 'cover-1707900000000.jpg')
        // The upload method also saves to IndexedDB using the filename stem as mediaId
        try {
          const coverFilename = await this.projectService.uploadProjectCover(
            updatedProject.username,
            updatedProject.slug,
            this.coverImage
          );
          // Use the filename stem (without extension) as the coverMediaId
          newCoverMediaId = coverFilename.replace(/\.[^.]+$/, '');
          this.currentCoverMediaId = newCoverMediaId;
        } catch (imageError) {
          // Log but don't fail - local storage is the source of truth
          console.warn(
            'Failed to upload cover to server (will sync later):',
            imageError
          );
        }
      }

      // Use UnifiedProjectService for update - handles both online and offline modes.
      // This only persists title/description to the project record — the cover
      // is a media blob (already saved above) plus coverMediaId in Yjs project
      // meta, neither of which depends on this call. So a failure here must
      // NOT discard the cover: apply the state/Yjs update with whatever
      // project object we have and surface the record-update failure softly.
      let response: Project;
      let recordUpdateError: string | null = null;
      try {
        response = await this.unifiedProjectService.updateProject(
          updatedProject.username,
          updatedProject.slug,
          {
            title: updatedProject.title,
            description: updatedProject.description,
          }
        );
      } catch (error: unknown) {
        recordUpdateError =
          error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to update project record:', recordUpdateError);
        response = updatedProject;
      }

      // Update project state with coverMediaId for Yjs sync — this is what
      // actually makes the cover show up, and it works offline-first.
      this.projectState.updateProject(response, newCoverMediaId);

      if (recordUpdateError) {
        this.showError(
          this.transloco.translate('dialogs.editProject.savedLocallyOnly', {
            error: recordUpdateError,
          })
        );
      } else {
        this.showSuccess(
          this.transloco.translate('dialogs.editProject.projectUpdated')
        );
      }
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
    this.snackBar.open(message, this.transloco.translate('close'), {
      duration: 5000,
      panelClass: ['error-snackbar'],
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, this.transloco.translate('close'), {
      duration: 3000,
      panelClass: ['success-snackbar'],
    });
  }
}
