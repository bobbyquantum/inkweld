import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
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
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ProjectsService } from '@inkweld/api/projects.service';
import { Project } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { UnifiedProjectService } from '@services/offline/unified-project.service';
import { ProjectService } from '@services/project/project.service';
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

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('coverImageInput') coverImageInput!: ElementRef<HTMLInputElement>;

  form = new FormGroup({
    title: new FormControl('', Validators.required),
    description: new FormControl(''),
  });

  isSaving = false;
  isLoadingCover = false;
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

  ngOnInit(): void {
    this.project = this.dialogData;
    console.log('dialogData: ', this.dialogData);
    console.log('Project: ', this.project);
    this.form.patchValue({
      title: this.project.title,
      description: this.project.description,
    });

    // Load cover image if available
    if (this.project.username && this.project.slug) {
      void this.loadCoverImage();
    }
  }

  async loadCoverImage(): Promise<void> {
    this.isLoadingCover = true;
    try {
      const coverBlob = await this.projectService.getProjectCover(
        this.project.username,
        this.project.slug
      );
      this.coverImage = coverBlob;
      this.coverImageUrl = this.sanitizer.bypassSecurityTrustUrl(
        URL.createObjectURL(coverBlob)
      );
      this.hasCoverImage = true;
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
      this.isLoadingCover = false;
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
      // Convert base64 to blob and update local state
      const blob = this.base64ToBlob(result.imageData);
      const file = new File([blob], 'generated-cover.png', {
        type: 'image/png',
      });
      this.coverImage = file;
      this.coverImageUrl = this.sanitizer.bypassSecurityTrustUrl(
        result.imageData
      );
      // Save immediately to the project
      if (this.project.username && this.project.slug) {
        this.isLoadingCover = true;
        try {
          await this.projectService.uploadProjectCover(
            this.project.username,
            this.project.slug,
            file
          );
          this.showSuccess('Cover image generated and saved successfully');
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.showError(`Failed to save cover image: ${errorMessage}`);
        } finally {
          this.isLoadingCover = false;
        }
      }
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

    this.isLoadingCover = true;
    try {
      await this.projectService.deleteProjectCover(
        this.project.username,
        this.project.slug
      );
      this.coverImage = undefined;
      this.coverImageUrl = undefined;
      this.hasCoverImage = false;
      this.showSuccess('Cover image removed successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.showError(`Failed to remove cover image: ${errorMessage}`);
    } finally {
      this.isLoadingCover = false;
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

    this.isSaving = true;
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
      // Use UnifiedProjectService for update - handles both online and offline modes
      const response = await this.unifiedProjectService.updateProject(
        updatedProject.username,
        updatedProject.slug,
        {
          title: updatedProject.title,
          description: updatedProject.description,
        }
      );

      // Handle cover image upload if we have a new image
      if (
        this.coverImage instanceof File &&
        updatedProject.username &&
        updatedProject.slug
      ) {
        // Check if it's a File
        try {
          await this.projectService.uploadProjectCover(
            updatedProject.username,
            updatedProject.slug,
            this.coverImage
          );
          this.showSuccess('Project and cover image updated successfully');
        } catch (imageError) {
          const errorMessage =
            imageError instanceof Error ? imageError.message : 'Unknown error';
          this.showError(
            `Project updated but failed to upload cover image: ${errorMessage}`
          );
          console.error('Failed to upload cover image:', errorMessage);
          // Continue - we still want to close the dialog even if the image upload failed
        }
      }

      this.dialogRef.close(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to update project:', errorMessage);
      this.showError(`Failed to update project: ${errorMessage}`);
    } finally {
      this.isSaving = false;
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
