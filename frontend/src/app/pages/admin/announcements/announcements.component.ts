import { DatePipe, TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  type Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';
import { firstValueFrom } from 'rxjs';

import {
  AnnouncementEditorDialogComponent,
  type AnnouncementEditorDialogData,
} from './announcement-editor-dialog/announcement-editor-dialog.component';

@Component({
  selector: 'app-admin-announcements',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    TitleCasePipe,
    TranslocoModule,
  ],
  templateUrl: './announcements.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './announcements.component.scss',
})
export class AdminAnnouncementsComponent implements OnInit {
  private readonly announcementService = inject(AnnouncementService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  readonly announcements = this.announcementService.adminAnnouncements;
  readonly isLoading = this.announcementService.isLoadingAdmin;
  readonly error = this.announcementService.error;

  ngOnInit(): void {
    void this.loadAnnouncements();
  }

  async loadAnnouncements(): Promise<void> {
    try {
      await this.announcementService.loadAdminAnnouncements();
    } catch {
      this.snackBar.open(
        this.transloco.translate('admin.announcements.loadFailed'),
        this.transloco.translate('dismiss'),
        { duration: 5000 }
      );
    }
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'maintenance':
        return 'build';
      case 'update':
        return 'update';
      case 'announcement':
      default:
        return 'campaign';
    }
  }

  getStatusKey(announcement: Announcement): string {
    if (!announcement.publishedAt) {
      return 'draft';
    }
    const publishedAt = new Date(announcement.publishedAt);
    const now = new Date();
    if (publishedAt > now) {
      return 'scheduled';
    }
    if (announcement.expiresAt && new Date(announcement.expiresAt) < now) {
      return 'expired';
    }
    return 'published';
  }

  getStatusLabel(announcement: Announcement): string {
    const key = this.getStatusKey(announcement);
    return this.transloco.translate(
      `admin.announcements.status${this.capitalize(key)}`
    );
  }

  getStatusClass(announcement: Announcement): string {
    return `status-${this.getStatusKey(announcement)}`;
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  async openCreateDialog(): Promise<void> {
    const dialogRef = this.dialog.open<
      AnnouncementEditorDialogComponent,
      AnnouncementEditorDialogData,
      boolean
    >(AnnouncementEditorDialogComponent, {
      width: '600px',
      maxHeight: '90vh',
      data: { mode: 'create' },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      this.snackBar.open(
        this.transloco.translate('admin.announcements.created_snackbar'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    }
  }

  async openEditDialog(announcement: Announcement): Promise<void> {
    const dialogRef = this.dialog.open<
      AnnouncementEditorDialogComponent,
      AnnouncementEditorDialogData,
      boolean
    >(AnnouncementEditorDialogComponent, {
      width: '600px',
      maxHeight: '90vh',
      data: { mode: 'edit', announcement },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      this.snackBar.open(
        this.transloco.translate('admin.announcements.updated'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    }
  }

  async publishAnnouncement(announcement: Announcement): Promise<void> {
    try {
      await this.announcementService.publishAnnouncement(announcement.id);
      this.snackBar.open(
        this.transloco.translate('admin.announcements.published_snackbar'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    } catch {
      this.snackBar.open(
        this.transloco.translate('admin.announcements.publishFailed'),
        this.transloco.translate('dismiss'),
        { duration: 5000 }
      );
    }
  }

  async unpublishAnnouncement(announcement: Announcement): Promise<void> {
    try {
      await this.announcementService.unpublishAnnouncement(announcement.id);
      this.snackBar.open(
        this.transloco.translate('admin.announcements.unpublished'),
        this.transloco.translate('dismiss'),
        { duration: 3000 }
      );
    } catch {
      this.snackBar.open(
        this.transloco.translate('admin.announcements.unpublishFailed'),
        this.transloco.translate('dismiss'),
        { duration: 5000 }
      );
    }
  }

  async confirmDelete(announcement: Announcement): Promise<void> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: this.transloco.translate('admin.announcements.deleteTitle'),
        message: this.transloco.translate('admin.announcements.deleteMessage', {
          title: announcement.title,
        }),
        confirmText: this.transloco.translate('delete'),
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await this.announcementService.deleteAnnouncement(announcement.id);
        this.snackBar.open(
          this.transloco.translate('admin.announcements.deleted'),
          this.transloco.translate('dismiss'),
          { duration: 3000 }
        );
      } catch {
        this.snackBar.open(
          this.transloco.translate('admin.announcements.deleteFailed'),
          this.transloco.translate('dismiss'),
          { duration: 5000 }
        );
      }
    }
  }
}
