import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { type SnapshotInfo } from '@services/local/local-snapshot.service';
import { TemplateSnapshotService } from '@services/project/template-snapshot.service';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '../confirmation-dialog/confirmation-dialog.component';
import {
  CreateSnapshotDialogComponent,
  type CreateSnapshotDialogData,
  type CreateSnapshotDialogResult,
} from '../create-snapshot-dialog/create-snapshot-dialog.component';

/** Data passed to the template snapshots dialog. */
export interface TemplateSnapshotsDialogData {
  /** Template (schema) id to show snapshots for. */
  templateId: string;
}

/**
 * Dialog for managing schema-template snapshots.
 *
 * Templates aren't Yjs documents, so this mirrors the snapshot lifecycle for
 * schema designs: create, list, restore (in place), and delete, backed by
 * {@link TemplateSnapshotService}.
 */
@Component({
  selector: 'app-template-snapshots-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './template-snapshots-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './template-snapshots-dialog.component.scss',
})
export class TemplateSnapshotsDialogComponent implements OnInit {
  private readonly dialogRef = inject(
    MatDialogRef<TemplateSnapshotsDialogComponent>
  );
  private readonly data = inject<TemplateSnapshotsDialogData>(MAT_DIALOG_DATA);
  private readonly templateSnapshotService = inject(TemplateSnapshotService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  loading = signal(false);
  snapshots = signal<SnapshotInfo[]>([]);
  error = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadSnapshots();
  }

  async loadSnapshots(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.templateSnapshotService.listTemplateSnapshots(
        this.data.templateId
      );
      this.snapshots.set(result);
    } catch (err) {
      console.error('Failed to load template snapshots:', err);
      this.error.set(this.transloco.translate('dialogs.snapshots.loadFailed'));
    } finally {
      this.loading.set(false);
    }
  }

  async createSnapshot(): Promise<void> {
    const dialogRef = this.dialog.open<
      CreateSnapshotDialogComponent,
      CreateSnapshotDialogData,
      CreateSnapshotDialogResult
    >(CreateSnapshotDialogComponent, {
      width: '500px',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    this.loading.set(true);
    try {
      await this.templateSnapshotService.createTemplateSnapshot(
        this.data.templateId,
        result.name,
        result.description
      );
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.created', {
          name: result.name,
        }),
        this.transloco.translate('ok'),
        { duration: 3000 }
      );
      await this.loadSnapshots();
    } catch (err) {
      console.error('Failed to create template snapshot:', err);
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.createFailed'),
        this.transloco.translate('ok'),
        { duration: 3000 }
      );
      this.loading.set(false);
    }
  }

  async restoreSnapshot(snapshot: SnapshotInfo): Promise<void> {
    const confirmed = await this.openConfirm(
      this.transloco.translate('dialogs.snapshots.title'),
      this.transloco.translate('dialogs.snapshots.restore'),
      this.transloco.translate('dialogs.snapshots.restore')
    );
    if (!confirmed) return;

    this.loading.set(true);
    try {
      await this.templateSnapshotService.restoreTemplateSnapshot(
        this.data.templateId,
        snapshot.id
      );
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.restored', {
          name: snapshot.name,
        }),
        this.transloco.translate('ok'),
        { duration: 3000 }
      );
      await this.loadSnapshots();
    } catch (err) {
      console.error('Failed to restore template snapshot:', err);
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.restoreFailed'),
        this.transloco.translate('ok'),
        { duration: 5000 }
      );
      this.loading.set(false);
    }
  }

  async deleteSnapshot(snapshot: SnapshotInfo): Promise<void> {
    const confirmed = await this.openConfirm(
      this.transloco.translate('dialogs.snapshots.deleteTitle'),
      this.transloco.translate('dialogs.snapshots.deleteMessage'),
      this.transloco.translate('delete')
    );
    if (!confirmed) return;

    this.loading.set(true);
    try {
      await this.templateSnapshotService.deleteTemplateSnapshot(snapshot.id);
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.deleted', {
          name: snapshot.name,
        }),
        this.transloco.translate('ok'),
        { duration: 3000 }
      );
      await this.loadSnapshots();
    } catch (err) {
      console.error('Failed to delete template snapshot:', err);
      this.snackBar.open(
        this.transloco.translate('dialogs.snapshots.deleteFailed'),
        this.transloco.translate('ok'),
        { duration: 5000 }
      );
      this.loading.set(false);
    }
  }

  private async openConfirm(
    title: string,
    message: string,
    confirmText: string
  ): Promise<boolean> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      width: '440px',
      data: {
        title,
        message,
        confirmText,
        cancelText: this.transloco.translate('cancel'),
      },
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    return result === true;
  }

  close(): void {
    this.dialogRef.close();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
}
