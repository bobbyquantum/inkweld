import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  getFormatDisplayName,
  getFormatIcon,
  PublishedFile,
  SharePermission,
} from '../../models/published-file';
import { SetupService } from '../../services/core/setup.service';
import { PublishedFilesService } from '../../services/publish/published-files.service';

/**
 * Data passed to the publish complete dialog
 */
export interface PublishCompleteDialogData {
  /** The saved published file record */
  file: PublishedFile;
  /** Project key (username/slug) */
  projectKey: string;
  /** The actual blob for download */
  blob: Blob;
}

/**
 * Result from the publish complete dialog
 */
export interface PublishCompleteDialogResult {
  action: 'download' | 'share' | 'view-files' | 'close';
  file?: PublishedFile;
}

/**
 * Dialog shown after publishing completes.
 *
 * Options:
 * - Download the file
 * - Copy share link (if sharing enabled)
 * - Change share permissions
 * - Navigate to published files view
 */
@Component({
  selector: 'app-publish-complete-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './publish-complete-dialog.component.html',
  styleUrl: './publish-complete-dialog.component.scss',
})
export class PublishCompleteDialogComponent {
  private dialogRef = inject(MatDialogRef<PublishCompleteDialogComponent>);
  private data = inject<PublishCompleteDialogData>(MAT_DIALOG_DATA);
  private publishedFilesService = inject(PublishedFilesService);
  private setupService = inject(SetupService);
  private snackBar = inject(MatSnackBar);

  /** The published file */
  file = signal(this.data.file);

  /** Current share permission */
  sharePermission = signal(this.data.file.sharePermission);

  /** Loading state for permission updates */
  updating = signal(false);

  /** Whether we're in online mode */
  isOnline = this.setupService.getMode() === 'server';

  /** Share permission options */
  readonly shareOptions = [
    { value: SharePermission.Private, label: 'Only me', icon: 'lock' },
    {
      value: SharePermission.Collaborators,
      label: 'Collaborators',
      icon: 'group',
      disabled: true,
      tooltip: 'Coming soon',
    },
    { value: SharePermission.Link, label: 'Anyone with link', icon: 'link' },
    { value: SharePermission.Public, label: 'Anyone', icon: 'public' },
  ];

  /** Format display name */
  get formatName(): string {
    return getFormatDisplayName(this.file().format);
  }

  /** Format icon */
  get formatIcon(): string {
    return getFormatIcon(this.file().format);
  }

  /** File size formatted */
  get fileSizeFormatted(): string {
    const bytes = this.file().size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /** Whether sharing is enabled */
  get canShare(): boolean {
    const permission = this.sharePermission();
    return (
      permission === SharePermission.Link ||
      permission === SharePermission.Public
    );
  }

  /** Get the share URL */
  get shareUrl(): string | null {
    return this.publishedFilesService.getShareUrl(this.file());
  }

  /**
   * Download the file
   */
  download(): void {
    const url = URL.createObjectURL(this.data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.file().filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.snackBar.open('File downloaded', 'Dismiss', { duration: 2000 });
  }

  /**
   * Copy share link to clipboard
   */
  async copyShareLink(): Promise<void> {
    const url = this.shareUrl;
    if (!url) {
      this.snackBar.open('Enable sharing first', 'Dismiss', { duration: 2000 });
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.snackBar.open('Link copied to clipboard', 'Dismiss', {
        duration: 2000,
      });
    } catch {
      this.snackBar.open('Failed to copy link', 'Dismiss', { duration: 2000 });
    }
  }

  /**
   * Update share permission
   */
  async onPermissionChange(permission: SharePermission): Promise<void> {
    if (permission === SharePermission.Collaborators) {
      // Not implemented yet
      return;
    }

    this.updating.set(true);
    this.sharePermission.set(permission);

    try {
      const updated = await this.publishedFilesService.updateSharePermission(
        this.data.projectKey,
        this.file().id,
        permission
      );

      if (updated) {
        this.file.set(updated);
      }
    } catch {
      this.snackBar.open('Failed to update sharing', 'Dismiss', {
        duration: 3000,
      });
    } finally {
      this.updating.set(false);
    }
  }

  /**
   * Navigate to published files view
   */
  viewFiles(): void {
    this.dialogRef.close({
      action: 'view-files',
      file: this.file(),
    } as PublishCompleteDialogResult);
  }

  /**
   * Close dialog
   */
  close(): void {
    this.dialogRef.close({
      action: 'close',
      file: this.file(),
    } as PublishCompleteDialogResult);
  }
}
