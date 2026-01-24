import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  Announcement,
  AnnouncementService,
} from '@services/announcement/announcement.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminAnnouncementsComponent } from './announcements.component';

describe('AdminAnnouncementsComponent', () => {
  let component: AdminAnnouncementsComponent;
  let fixture: ComponentFixture<AdminAnnouncementsComponent>;

  let mockAnnouncementService: {
    adminAnnouncements: ReturnType<typeof signal<Announcement[]>>;
    isLoadingAdmin: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadAdminAnnouncements: ReturnType<typeof vi.fn>;
    publishAnnouncement: ReturnType<typeof vi.fn>;
    unpublishAnnouncement: ReturnType<typeof vi.fn>;
    deleteAnnouncement: ReturnType<typeof vi.fn>;
  };

  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  let mockDialog: { open: ReturnType<typeof vi.fn> };

  const createMockAnnouncement = (
    overrides: Partial<Announcement> = {}
  ): Announcement => ({
    id: '1',
    title: 'Test',
    content: 'Test content',
    type: 'announcement',
    priority: 'normal',
    isPublic: true,
    publishedAt: null,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'admin-user-id',
    ...overrides,
  });

  beforeEach(async () => {
    mockAnnouncementService = {
      adminAnnouncements: signal([]),
      isLoadingAdmin: signal(false),
      error: signal(null),
      loadAdminAnnouncements: vi.fn().mockResolvedValue(undefined),
      publishAnnouncement: vi.fn().mockResolvedValue(undefined),
      unpublishAnnouncement: vi.fn().mockResolvedValue(undefined),
      deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(false),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminAnnouncementsComponent],
      providers: [
        provideAnimations(),
        { provide: AnnouncementService, useValue: mockAnnouncementService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load announcements on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAnnouncementService.loadAdminAnnouncements).toHaveBeenCalled();
    });
  });

  describe('getTypeIcon', () => {
    it('should return build icon for maintenance', () => {
      expect(component.getTypeIcon('maintenance')).toBe('build');
    });

    it('should return update icon for update', () => {
      expect(component.getTypeIcon('update')).toBe('update');
    });

    it('should return campaign icon for announcement', () => {
      expect(component.getTypeIcon('announcement')).toBe('campaign');
    });

    it('should return campaign icon for unknown type', () => {
      expect(component.getTypeIcon('unknown')).toBe('campaign');
    });
  });

  describe('getStatusLabel', () => {
    it('should return Draft for unpublished announcement', () => {
      const announcement = createMockAnnouncement({ publishedAt: null });
      expect(component.getStatusLabel(announcement)).toBe('Draft');
    });

    it('should return Scheduled for future publishedAt', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const announcement = createMockAnnouncement({
        publishedAt: futureDate.toISOString(),
      });
      expect(component.getStatusLabel(announcement)).toBe('Scheduled');
    });

    it('should return Expired for past expiresAt', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const announcement = createMockAnnouncement({
        publishedAt: new Date(Date.now() - 86400000).toISOString(),
        expiresAt: pastDate.toISOString(),
      });
      expect(component.getStatusLabel(announcement)).toBe('Expired');
    });

    it('should return Published for currently active announcement', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const announcement = createMockAnnouncement({
        publishedAt: pastDate.toISOString(),
        expiresAt: futureDate.toISOString(),
      });
      expect(component.getStatusLabel(announcement)).toBe('Published');
    });
  });

  describe('getStatusClass', () => {
    it('should return status-draft for draft announcements', () => {
      const announcement = createMockAnnouncement({ publishedAt: null });
      expect(component.getStatusClass(announcement)).toBe('status-draft');
    });

    it('should return status-scheduled for scheduled announcements', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const announcement = createMockAnnouncement({
        publishedAt: futureDate.toISOString(),
      });
      expect(component.getStatusClass(announcement)).toBe('status-scheduled');
    });

    it('should return status-expired for expired announcements', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const announcement = createMockAnnouncement({
        publishedAt: new Date(Date.now() - 86400000).toISOString(),
        expiresAt: pastDate.toISOString(),
      });
      expect(component.getStatusClass(announcement)).toBe('status-expired');
    });

    it('should return status-published for published announcements', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const announcement = createMockAnnouncement({
        publishedAt: pastDate.toISOString(),
        expiresAt: null,
      });
      expect(component.getStatusClass(announcement)).toBe('status-published');
    });
  });

  describe('openCreateDialog', () => {
    it('should open dialog with create mode', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      await component.openCreateDialog();

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: { mode: 'create' },
        })
      );
    });
  });

  describe('openEditDialog', () => {
    it('should open dialog with edit mode and announcement', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const announcement = createMockAnnouncement();
      await component.openEditDialog(announcement);

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: { mode: 'edit', announcement },
        })
      );
    });
  });

  describe('publishAnnouncement', () => {
    it('should call publishAnnouncement on the service', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const announcement = createMockAnnouncement();
      await component.publishAnnouncement(announcement);

      expect(mockAnnouncementService.publishAnnouncement).toHaveBeenCalledWith(
        '1'
      );
    });
  });

  describe('unpublishAnnouncement', () => {
    it('should call unpublishAnnouncement on the service', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const announcement = createMockAnnouncement();
      await component.unpublishAnnouncement(announcement);

      expect(
        mockAnnouncementService.unpublishAnnouncement
      ).toHaveBeenCalledWith('1');
    });
  });

  describe('confirmDelete', () => {
    it('should open confirmation dialog', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      const announcement = createMockAnnouncement();
      await component.confirmDelete(announcement);

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Delete Announcement',
            confirmText: 'Delete',
          }),
        })
      );
    });

    it('should not delete when dialog cancelled', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      mockDialog.open.mockReturnValue({
        afterClosed: () => of(false),
      });

      await component.confirmDelete(createMockAnnouncement());

      expect(mockAnnouncementService.deleteAnnouncement).not.toHaveBeenCalled();
    });

    it('should delete when dialog confirmed', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      await component.confirmDelete(createMockAnnouncement());

      expect(mockAnnouncementService.deleteAnnouncement).toHaveBeenCalledWith(
        '1'
      );
    });
  });
});
