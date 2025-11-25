import {
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocumentSnapshotService } from '@services/project/document-snapshot.service';

import { DocumentSnapshot } from '../../../api-client';
import {
  CreateSnapshotDialogComponent,
  CreateSnapshotDialogData,
  CreateSnapshotDialogResult,
} from '../../dialogs/create-snapshot-dialog/create-snapshot-dialog.component';
import {
  RestoreSnapshotDialogComponent,
  RestoreSnapshotDialogData,
} from '../../dialogs/restore-snapshot-dialog/restore-snapshot-dialog.component';

/**
 * Reusable snapshot panel component
 * Displays a list of snapshots with create, restore, preview, and delete actions
 * Microsoft Dynamics-style side panel design
 */
@Component({
  selector: 'app-snapshot-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './snapshot-panel.component.html',
  styleUrl: './snapshot-panel.component.scss',
})
export class SnapshotPanelComponent implements OnInit {
  /** Document ID to show snapshots for */
  documentId = input.required<string>();

  /** Event emitted when the panel should be closed */
  closePanel = output<void>();

  /** Loading state */
  loading = signal(false);

  /** Snapshots list */
  snapshots = signal<DocumentSnapshot[]>([]);

  /** Error message */
  error = signal<string | null>(null);

  private snapshotService = inject(DocumentSnapshotService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  ngOnInit() {
    this.loadSnapshots();
  }

  /**
   * Load snapshots for the current document
   */
  loadSnapshots() {
    this.loading.set(true);
    this.error.set(null);

    this.snapshotService
      .listSnapshots(this.documentId(), {
        orderBy: 'createdAt',
        order: 'DESC',
        limit: 100,
      })
      .subscribe({
        next: result => {
          this.snapshots.set(result);
          this.loading.set(false);
        },
        error: err => {
          console.error('Failed to load snapshots:', err);
          this.error.set('Failed to load snapshots. Please try again.');
          this.loading.set(false);
        },
      });
  }

  /**
   * Open dialog to create a new snapshot
   */
  async createSnapshot() {
    const dialogRef = this.dialog.open<
      CreateSnapshotDialogComponent,
      CreateSnapshotDialogData,
      CreateSnapshotDialogResult
    >(CreateSnapshotDialogComponent, {
      width: '500px',
      data: {
        wordCount: this.calculateCurrentWordCount(),
      },
    });

    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      this.loading.set(true);
      this.snapshotService
        .createSnapshot(this.documentId(), {
          documentId: this.documentId(),
          name: result.name,
          description: result.description,
          yDocState: '', // TODO: Get actual yDoc state from editor
        })
        .subscribe({
          next: snapshot => {
            this.snackBar.open(
              `Snapshot "${snapshot.name}" created successfully`,
              'OK',
              {
                duration: 3000,
              }
            );
            this.loadSnapshots();
          },
          error: err => {
            console.error('Failed to create snapshot:', err);
            this.snackBar.open('Failed to create snapshot', 'OK', {
              duration: 3000,
            });
            this.loading.set(false);
          },
        });
    }
  }

  /**
   * Open dialog to restore a snapshot
   */
  async restoreSnapshot(snapshot: DocumentSnapshot) {
    const dialogRef = this.dialog.open<
      RestoreSnapshotDialogComponent,
      RestoreSnapshotDialogData,
      boolean
    >(RestoreSnapshotDialogComponent, {
      width: '600px',
      data: {
        snapshot,
        currentWordCount: this.calculateCurrentWordCount(),
      },
    });

    const confirmed = await dialogRef.afterClosed().toPromise();
    if (confirmed) {
      this.loading.set(true);
      this.snapshotService
        .restoreSnapshot(this.documentId(), snapshot.id)
        .subscribe({
          next: () => {
            this.snackBar.open(
              `Document restored to "${snapshot.name}"`,
              'OK',
              { duration: 3000 }
            );

            this.loading.set(false);
            this.loadSnapshots(); // Refresh the snapshot list
          },
          error: err => {
            console.error('Failed to restore snapshot:', err);
            this.snackBar.open('Failed to restore snapshot', 'OK', {
              duration: 3000,
            });
            this.loading.set(false);
          },
        });
    }
  }

  /**
   * Preview snapshot as HTML in new window/tab
   * TODO: Backend API now returns SnapshotWithContent (yDocState), not HTML
   * Need to render yDocState to HTML on frontend or add HTML rendering to backend
   */
  previewSnapshot(snapshot: DocumentSnapshot) {
    this.snapshotService
      .previewSnapshot(this.documentId(), snapshot.id)
      .subscribe({
        next: snapshotContent => {
          // TODO: Render yDocState to HTML
          // For now, show a message that preview is not available
          this.snackBar.open(
            'Preview feature needs implementation (backend returns yDocState, not HTML)',
            'OK',
            {
              duration: 5000,
            }
          );
          console.log('Snapshot content:', snapshotContent);
        },
        error: err => {
          console.error('Failed to preview snapshot:', err);
          this.snackBar.open('Failed to preview snapshot', 'OK', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(snapshot: DocumentSnapshot) {
    if (
      !confirm(
        `Are you sure you want to delete the snapshot "${snapshot.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    this.snapshotService
      .deleteSnapshot(this.documentId(), snapshot.id)
      .subscribe({
        next: () => {
          this.snackBar.open('Snapshot deleted successfully', 'OK', {
            duration: 3000,
          });
          this.loadSnapshots(); // Reload the list
        },
        error: err => {
          console.error('Failed to delete snapshot:', err);
          this.snackBar.open('Failed to delete snapshot', 'OK', {
            duration: 3000,
          });
        },
      });
  }

  /**
   * Format date for display
   */
  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString();
  }

  /**
   * Format word count with commas
   */
  formatWordCount(count: number | null | undefined): string {
    return count?.toLocaleString() ?? '0';
  }

  /**
   * Calculate current document word count
   * TODO: This should be passed as an input or retrieved from document service
   */
  private calculateCurrentWordCount(): number | undefined {
    // Placeholder - will be implemented when integrating with editor
    return undefined;
  }
}
