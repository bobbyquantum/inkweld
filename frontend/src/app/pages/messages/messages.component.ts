import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterModule } from '@angular/router';
import { AnnouncementCardComponent } from '@components/announcement-card/announcement-card.component';
import { AnnouncementService } from '@services/announcement/announcement.service';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    RouterModule,
    AnnouncementCardComponent,
  ],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnInit {
  protected readonly announcementService = inject(AnnouncementService);

  ngOnInit(): void {
    void this.loadMessages();
  }

  async loadMessages(): Promise<void> {
    try {
      await this.announcementService.loadAnnouncements();
    } catch (error) {
      console.error('Failed to load messages', error);
    }
  }

  async onMarkAsRead(announcementId: string): Promise<void> {
    try {
      await this.announcementService.markAsRead(announcementId);
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  }

  async onMarkAllAsRead(): Promise<void> {
    try {
      await this.announcementService.markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  }

  get hasAnnouncements(): boolean {
    return this.announcementService.announcements().length > 0;
  }

  get hasUnread(): boolean {
    return this.announcementService.hasUnread();
  }
}
