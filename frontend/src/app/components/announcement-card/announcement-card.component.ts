import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type {
  Announcement,
  AnnouncementWithReadStatus,
} from '@services/announcement/announcement.service';

@Component({
  selector: 'app-announcement-card',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './announcement-card.component.html',
  styleUrl: './announcement-card.component.scss',
})
export class AnnouncementCardComponent {
  @Input({ required: true }) announcement!:
    | Announcement
    | AnnouncementWithReadStatus;
  @Input() showReadStatus = false;
  @Input() compact = false;

  @Output() markAsRead = new EventEmitter<string>();

  get isRead(): boolean {
    return 'isRead' in this.announcement ? this.announcement.isRead : true;
  }

  get typeIcon(): string {
    switch (this.announcement.type) {
      case 'maintenance':
        return 'build';
      case 'update':
        return 'update';
      case 'announcement':
      default:
        return 'campaign';
    }
  }

  get typeLabel(): string {
    switch (this.announcement.type) {
      case 'maintenance':
        return 'Maintenance';
      case 'update':
        return 'Update';
      case 'announcement':
      default:
        return 'Announcement';
    }
  }

  get priorityClass(): string {
    return `priority-${this.announcement.priority}`;
  }

  onMarkAsRead(): void {
    if (!this.isRead) {
      this.markAsRead.emit(this.announcement.id);
    }
  }
}
