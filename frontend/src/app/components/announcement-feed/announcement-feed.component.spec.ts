import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';
import { describe, expect, it, vi } from 'vitest';

import { AnnouncementFeedComponent } from './announcement-feed.component';

describe('AnnouncementFeedComponent', () => {
  let component: AnnouncementFeedComponent;
  let fixture: ComponentFixture<AnnouncementFeedComponent>;
  let announcementServiceMock: {
    publicAnnouncements: ReturnType<typeof signal<Announcement[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    loadPublicAnnouncements: ReturnType<typeof vi.fn>;
  };

  const mockAnnouncements: Announcement[] = [
    {
      id: '1',
      title: 'Announcement 1',
      content: 'Content 1',
      type: 'announcement',
      priority: 'normal',
      isPublic: true,
      publishedAt: '2025-01-01T00:00:00Z',
      expiresAt: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdBy: 'admin',
    },
    {
      id: '2',
      title: 'Announcement 2',
      content: 'Content 2',
      type: 'update',
      priority: 'high',
      isPublic: true,
      publishedAt: '2025-01-02T00:00:00Z',
      expiresAt: null,
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      createdBy: 'admin',
    },
  ];

  beforeEach(async () => {
    announcementServiceMock = {
      publicAnnouncements: signal<Announcement[]>([]),
      isLoading: signal(false),
      loadPublicAnnouncements: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AnnouncementFeedComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AnnouncementService, useValue: announcementServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnnouncementFeedComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load announcements on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(
        announcementServiceMock.loadPublicAnnouncements
      ).toHaveBeenCalled();
    });

    it('should handle loadAnnouncements error', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      announcementServiceMock.loadPublicAnnouncements.mockRejectedValue(
        new Error('Load failed')
      );

      fixture.detectChanges();
      await fixture.whenStable();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to load public announcements',
        expect.any(Error)
      );
    });
  });

  describe('displayedAnnouncements', () => {
    it('should return empty array when no announcements', () => {
      fixture.detectChanges();
      expect(component.displayedAnnouncements).toEqual([]);
    });

    it('should limit announcements to maxItems', () => {
      announcementServiceMock.publicAnnouncements.set([
        ...mockAnnouncements,
        { ...mockAnnouncements[0], id: '3' },
        { ...mockAnnouncements[0], id: '4' },
        { ...mockAnnouncements[0], id: '5' },
        { ...mockAnnouncements[0], id: '6' },
      ]);
      component.maxItems = 3;
      fixture.detectChanges();

      expect(component.displayedAnnouncements.length).toBe(3);
    });
  });

  describe('hasAnnouncements', () => {
    it('should return false when no announcements', () => {
      fixture.detectChanges();
      expect(component.hasAnnouncements).toBe(false);
    });

    it('should return true when announcements exist', () => {
      announcementServiceMock.publicAnnouncements.set(mockAnnouncements);
      fixture.detectChanges();
      expect(component.hasAnnouncements).toBe(true);
    });
  });
});
