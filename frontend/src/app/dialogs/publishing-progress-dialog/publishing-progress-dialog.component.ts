import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  PublishingPhase,
  PublishingProgress,
  PublishService,
} from '@services/publish';
import { Observable, Subject, takeUntil } from 'rxjs';

/**
 * Data passed to the publishing progress dialog
 */
export interface PublishingProgressDialogData {
  /** The publish plan ID to execute */
  planId: string;
  /** Optional custom filename for the output */
  filename?: string;
  /** Whether to skip sync phase */
  skipSync?: boolean;
}

/**
 * Result returned from the dialog
 */
export interface PublishingProgressDialogResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

/**
 * Dialog that shows publishing progress with detailed status updates.
 *
 * This dialog:
 * - Displays overall progress with a progress bar
 * - Shows current phase (syncing, generating, etc.)
 * - Displays detailed status messages
 * - Allows cancellation during appropriate phases
 * - Shows success/error state on completion
 */
@Component({
  selector: 'app-publishing-progress-dialog',
  templateUrl: './publishing-progress-dialog.component.html',
  styleUrls: ['./publishing-progress-dialog.component.scss'],
  standalone: true,
  imports: [
    AsyncPipe,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
})
export class PublishingProgressDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<PublishingProgressDialogComponent>
  );
  private readonly data = inject<PublishingProgressDialogData>(MAT_DIALOG_DATA);
  private readonly publishService = inject(PublishService);

  private readonly destroy$ = new Subject<void>();

  /** Observable of publishing progress */
  readonly progress$: Observable<PublishingProgress> =
    this.publishService.progress$;

  /** Expose phase enum for template */
  readonly PublishingPhase = PublishingPhase;

  ngOnInit(): void {
    // Start publishing when dialog opens
    void this.startPublishing();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Start the publishing process
   */
  private async startPublishing(): Promise<void> {
    try {
      const result = await this.publishService.publish(this.data.planId, {
        filename: this.data.filename,
        skipSync: this.data.skipSync,
      });

      // Subscribe to progress to detect completion
      this.publishService.progress$
        .pipe(takeUntil(this.destroy$))
        .subscribe(progress => {
          if (progress.phase === PublishingPhase.COMPLETE) {
            // Auto-close dialog after success
            setTimeout(() => {
              this.dialogRef.close({
                success: true,
              } as PublishingProgressDialogResult);
            }, 1500);
          } else if (progress.phase === PublishingPhase.ERROR) {
            // Stay open on error so user can see the message
          } else if (progress.phase === PublishingPhase.CANCELLED) {
            this.dialogRef.close({
              success: false,
              cancelled: true,
            } as PublishingProgressDialogResult);
          }
        });

      if (!result.success) {
        // Error will be shown via progress$
      }
    } catch {
      // Error handling via progress$
    }
  }

  /**
   * Cancel the publishing operation
   */
  onCancel(): void {
    const currentProgress = this.publishService.currentProgress;
    if (currentProgress.cancellable) {
      this.publishService.cancel();
    } else {
      // Just close if not cancellable
      this.dialogRef.close({
        success: false,
        cancelled: true,
      } as PublishingProgressDialogResult);
    }
  }

  /**
   * Close the dialog (after completion or error)
   */
  onClose(): void {
    const currentProgress = this.publishService.currentProgress;
    this.dialogRef.close({
      success: currentProgress.phase === PublishingPhase.COMPLETE,
      error: currentProgress.error,
      cancelled: currentProgress.phase === PublishingPhase.CANCELLED,
    } as PublishingProgressDialogResult);
  }

  /**
   * Get icon for current phase
   */
  getPhaseIcon(phase: PublishingPhase): string {
    switch (phase) {
      case PublishingPhase.IDLE:
        return 'hourglass_empty';
      case PublishingPhase.INITIALIZING:
        return 'settings';
      case PublishingPhase.SYNCING:
        return 'sync';
      case PublishingPhase.GENERATING:
        return 'auto_stories';
      case PublishingPhase.FINALIZING:
        return 'check_circle_outline';
      case PublishingPhase.COMPLETE:
        return 'check_circle';
      case PublishingPhase.ERROR:
        return 'error';
      case PublishingPhase.CANCELLED:
        return 'cancel';
      default:
        return 'hourglass_empty';
    }
  }

  /**
   * Get human-readable phase name
   */
  getPhaseName(phase: PublishingPhase): string {
    switch (phase) {
      case PublishingPhase.IDLE:
        return 'Preparing';
      case PublishingPhase.INITIALIZING:
        return 'Initializing';
      case PublishingPhase.SYNCING:
        return 'Syncing Documents';
      case PublishingPhase.GENERATING:
        return 'Generating Output';
      case PublishingPhase.FINALIZING:
        return 'Finalizing';
      case PublishingPhase.COMPLETE:
        return 'Complete';
      case PublishingPhase.ERROR:
        return 'Error';
      case PublishingPhase.CANCELLED:
        return 'Cancelled';
      default:
        return 'Processing';
    }
  }

  /**
   * Check if the current phase is a final state
   */
  isFinalPhase(phase: PublishingPhase): boolean {
    return [
      PublishingPhase.COMPLETE,
      PublishingPhase.ERROR,
      PublishingPhase.CANCELLED,
    ].includes(phase);
  }
}
