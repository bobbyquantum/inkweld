import {
  Component,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FileListComponent } from '@components/file-list/file-list.component';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import {
  ProjectFile,
  ProjectFileService,
} from '@services/project-file.service';
import { ProjectStateService } from '@services/project-state.service';
import { firstValueFrom, Subject } from 'rxjs';

@Component({
  selector: 'app-project-files-tab',
  templateUrl: './project-files-tab.component.html',
  styleUrls: ['./project-files-tab.component.scss'],
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FileListComponent,
  ],
})
export class ProjectFilesTabComponent implements OnInit, OnDestroy {
  protected readonly projectState = inject(ProjectStateService);
  private readonly fileService = inject(ProjectFileService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private destroy$ = new Subject<void>();

  files = signal<ProjectFile[] | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  snackbarMessage = signal<string | null>(null);
  snackbarType = signal<'success' | 'error'>('success');
  private snackbarTimeout: number | null = null;

  // Add effect to reload files when project changes
  private readonly projectEffect = effect(() => {
    const project = this.projectState.project();
    if (project) {
      void this.loadFiles();
    }
  });

  ngOnInit(): void {
    void this.loadFiles();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.projectEffect.destroy();

    // Clear any pending timeout
    if (this.snackbarTimeout !== null) {
      window.clearTimeout(this.snackbarTimeout);
    }
  }

  async loadFiles(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const project = this.projectState.project();
      if (!project) {
        this.error.set('Project not available');
        this.loading.set(false);
        return;
      }

      const files = await firstValueFrom(
        this.fileService.getProjectFiles(project.username, project.slug)
      );
      this.files.set(files);
    } catch (err) {
      console.error('Error loading files:', err);
      this.error.set('Failed to load project files');
    } finally {
      this.loading.set(false);
    }
  }

  retryLoading(): void {
    void this.loadFiles();
  }

  async openUploadDialog(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    try {
      const file = await this.dialogGateway.openFileUploadDialog();

      if (file) {
        // Upload the file
        await firstValueFrom(
          this.fileService.uploadFile(project.username, project.slug, file)
        );

        this.showSnackbar('File uploaded successfully', 'success');
        await this.loadFiles(); // Refresh file list
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.showSnackbar('Failed to upload file', 'error');
    }
  }

  async confirmDeleteFile(file: ProjectFile): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete File',
      message: `Are you sure you want to delete "${file.originalName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      await this.deleteFile(file);
    }
  }

  private async deleteFile(file: ProjectFile): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    try {
      await firstValueFrom(
        this.fileService.deleteFile(
          project.username,
          project.slug,
          file.storedName
        )
      );

      this.showSnackbar('File deleted successfully', 'success');
      // Update file list after deletion
      const currentFiles = this.files() || [];
      this.files.set(
        currentFiles.filter(f => f.storedName !== file.storedName)
      );
    } catch (error) {
      console.error('Error deleting file:', error);
      this.showSnackbar('Failed to delete file', 'error');
    }
  }

  private showSnackbar(message: string, type: 'success' | 'error'): void {
    this.snackbarMessage.set(message);
    this.snackbarType.set(type);

    // Clear existing timeout if any
    if (this.snackbarTimeout !== null) {
      window.clearTimeout(this.snackbarTimeout);
    }

    // Hide snackbar after 3 seconds
    this.snackbarTimeout = window.setTimeout(() => {
      this.snackbarMessage.set(null);
      this.snackbarTimeout = null;
    }, 3000);
  }
}




