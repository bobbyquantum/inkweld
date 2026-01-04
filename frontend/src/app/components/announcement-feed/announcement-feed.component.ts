import { Component, inject, Input, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AnnouncementCardComponent } from '@components/announcement-card/announcement-card.component';
import { AnnouncementService } from '@services/announcement/announcement.service';

@Component({
  selector: 'app-announcement-feed',
  standalone: true,
  imports: [MatProgressSpinnerModule, MatIconModule, AnnouncementCardComponent],
  templateUrl: './announcement-feed.component.html',
  styleUrl: './announcement-feed.component.scss',
})
export class AnnouncementFeedComponent implements OnInit {
  @Input() maxItems = 5;
  @Input() compact = true;

  protected readonly announcementService = inject(AnnouncementService);

  ngOnInit(): void {
    void this.loadAnnouncements();
  }

  async loadAnnouncements(): Promise<void> {
    try {
      await this.announcementService.loadPublicAnnouncements();
    } catch (error) {
      // Error is handled by the service
      console.error('Failed to load public announcements', error);
    }
  }

  get displayedAnnouncements() {
    return this.announcementService
      .publicAnnouncements()
      .slice(0, this.maxItems);
  }

  get hasAnnouncements(): boolean {
    return this.announcementService.publicAnnouncements().length > 0;
  }
}
