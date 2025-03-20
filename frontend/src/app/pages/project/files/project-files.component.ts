import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { FileListComponent } from '@components/file-list/file-list.component';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import {
  ProjectFile,
  ProjectFileService,
} from '@services/project-file.service';
import {
  BehaviorSubject,
  catchError,
  finalize,
  Subject,
  takeUntil,
  throwError,
  timer,
} from 'rxjs';

@Component({
  selector: 'app-project-files',
  standalone: true,
  imports: [
    FileListComponent,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './project-files.component.html',
  styleUrls: ['./project-files.component.scss'],
})
export class ProjectFilesComponent implements OnInit, OnDestroy {
  // State signals
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  snackbarMessage = signal<string | null>(null);
  snackbarType = signal<'success' | 'error'>('success');
  files = signal<ProjectFile[] | null>(null);

  // Injected services
  private fileService = inject(ProjectFileService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialogGateway = inject(DialogGatewayService);
  private destroy$ = new Subject<void>();

  // Project parameters
  private username = '';
  private projectSlug = '';
  private filesSubject = new BehaviorSubject<ProjectFile[] | null>(null);

  // Lifecycle hooks
  ngOnInit(): void {
    // Initialize project parameters
    this.username = this.route.snapshot.params['username'] as string;
    this.projectSlug = this.route.snapshot.params['slug'] as string;

    // Load project files
    this.loadProjectFiles();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Public methods
  /**
   * Navigate back to the project details page
   */
  navigateToProject(): void {
    void this.router.navigate([this.username, this.projectSlug]);
  }

  /**
   * Retry loading files when there was an error
   */
  retryLoading(): void {
    this.loading.set(true); // Explicitly set loading to true first
    this.error.set(null); // Clear the error state
    this.loadProjectFiles();
  }

  /**
   * Open the file upload dialog
   */
  async openUploadDialog(): Promise<void> {
    const file = await this.dialogGateway.openFileUploadDialog();

    if (file) {
      this.loading.set(true);
      this.fileService
        .uploadFile(this.username, this.projectSlug, file)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.loading.set(false))
        )
        .subscribe({
          next: () => {
            this.showSnackbar('File uploaded successfully', 'success');
            this.loadProjectFiles(); // Refresh the file list
          },
          error: (error: unknown) => {
            console.error('File upload failed:', error);
            this.showSnackbar('Failed to upload file', 'error');
          },
        });
    }
  }

  /**
   * Show confirmation dialog before deleting a file
   */
  async confirmDeleteFile(file: ProjectFile): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.originalName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      this.onDeleteFile(file);
    }
  }

  /**
   * Process file deletion after confirmation
   * Made package-private instead of private for testing
   */
  /* @internal */ // For testing purposes
  onDeleteFile(file: ProjectFile): void {
    this.loading.set(true);
    this.fileService
      .deleteFile(this.username, this.projectSlug, file.storedName)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: () => {
          this.showSnackbar('File deleted successfully', 'success');
          this.loadProjectFiles(); // Refresh the file list
        },
        error: (error: unknown) => {
          console.error('File deletion failed:', error);
          this.showSnackbar('Failed to delete file', 'error');
        },
      });
  }

  // Private methods
  /**
   * Load project files and handle the response
   */
  private loadProjectFiles(): void {
    this.loading.set(true);
    this.error.set(null);

    this.fileService
      .getProjectFiles(this.username, this.projectSlug)
      .pipe(
        takeUntil(this.destroy$),
        catchError((err: HttpErrorResponse) => {
          const errorMessage = err.message || 'Failed to load project files';
          this.error.set(errorMessage);
          return throwError(() => new Error(errorMessage));
        }),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: files => {
          // Add file URLs to each file before setting the state
          const filesWithUrls = files.map(file => ({
            ...file,
            fileUrl: this.fileService.getFileUrl(
              this.username,
              this.projectSlug,
              file.storedName
            ),
          }));
          this.files.set(filesWithUrls);
        },
        error: () => {
          // Reset files to null on error
          this.files.set(null);
        },
      });
  }

  /**
   * Display a snackbar message
   */
  private showSnackbar(message: string, type: 'success' | 'error'): void {
    this.snackbarMessage.set(message);
    this.snackbarType.set(type);

    // Auto hide the snackbar after 3 seconds
    timer(3000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.snackbarMessage.set(null);
      });
  }
}
