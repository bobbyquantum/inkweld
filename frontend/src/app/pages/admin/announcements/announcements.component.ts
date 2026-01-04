import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
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
  ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import {
  Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';
import { firstValueFrom } from 'rxjs';

import {
  AnnouncementEditorDialogComponent,
  AnnouncementEditorDialogData,
} from './announcement-editor-dialog/announcement-editor-dialog.component';

@Component({
  selector: 'app-admin-announcements',
  standalone: true,
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
  ],
  templateUrl: './announcements.component.html',
  styleUrl: './announcements.component.scss',
})
export class AdminAnnouncementsComponent implements OnInit {
  private readonly announcementService = inject(AnnouncementService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

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
      this.snackBar.open('Failed to load announcements', 'Dismiss', {
        duration: 5000,
      });
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

  getStatusLabel(announcement: Announcement): string {
    if (!announcement.publishedAt) {
      return 'Draft';
    }
    const publishedAt = new Date(announcement.publishedAt);
    const now = new Date();
    if (publishedAt > now) {
      return 'Scheduled';
    }
    if (announcement.expiresAt && new Date(announcement.expiresAt) < now) {
      return 'Expired';
    }
    return 'Published';
  }

  getStatusClass(announcement: Announcement): string {
    const status = this.getStatusLabel(announcement);
    return `status-${status.toLowerCase()}`;
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
      this.snackBar.open('Announcement created', 'Dismiss', {
        duration: 3000,
      });
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
      this.snackBar.open('Announcement updated', 'Dismiss', {
        duration: 3000,
      });
    }
  }

  async publishAnnouncement(announcement: Announcement): Promise<void> {
    try {
      await this.announcementService.publishAnnouncement(announcement.id);
      this.snackBar.open('Announcement published', 'Dismiss', {
        duration: 3000,
      });
    } catch {
      this.snackBar.open('Failed to publish announcement', 'Dismiss', {
        duration: 5000,
      });
    }
  }

  async unpublishAnnouncement(announcement: Announcement): Promise<void> {
    try {
      await this.announcementService.unpublishAnnouncement(announcement.id);
      this.snackBar.open('Announcement unpublished', 'Dismiss', {
        duration: 3000,
      });
    } catch {
      this.snackBar.open('Failed to unpublish announcement', 'Dismiss', {
        duration: 5000,
      });
    }
  }

  async confirmDelete(announcement: Announcement): Promise<void> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      data: {
        title: 'Delete Announcement',
        message: `Are you sure you want to delete "${announcement.title}"? This action cannot be undone.`,
        confirmText: 'Delete',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await this.announcementService.deleteAnnouncement(announcement.id);
        this.snackBar.open('Announcement deleted', 'Dismiss', {
          duration: 3000,
        });
      } catch {
        this.snackBar.open('Failed to delete announcement', 'Dismiss', {
          duration: 5000,
        });
      }
    }
  }
}
