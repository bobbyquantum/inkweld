import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  Announcement,
  AnnouncementWithReadStatus,
} from '@services/announcement/announcement.service';
import { describe, expect, it, vi } from 'vitest';

import { AnnouncementCardComponent } from './announcement-card.component';

describe('AnnouncementCardComponent', () => {
  let component: AnnouncementCardComponent;
  let fixture: ComponentFixture<AnnouncementCardComponent>;

  const mockAnnouncement: Announcement = {
    id: '1',
    title: 'Test Announcement',
    content: 'Test content',
    type: 'announcement',
    priority: 'normal',
    isPublic: true,
    publishedAt: '2025-01-01T00:00:00Z',
    expiresAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    createdBy: 'admin',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnnouncementCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AnnouncementCardComponent);
    component = fixture.componentInstance;
    component.announcement = mockAnnouncement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('isRead', () => {
    it('should return true for announcement without isRead property', () => {
      component.announcement = mockAnnouncement;
      expect(component.isRead).toBe(true);
    });

    it('should return the isRead value for AnnouncementWithReadStatus', () => {
      const announcementWithStatus: AnnouncementWithReadStatus = {
        ...mockAnnouncement,
        isRead: false,
        readAt: null,
      };
      component.announcement = announcementWithStatus;
      expect(component.isRead).toBe(false);
    });

    it('should return true when isRead is true', () => {
      const announcementWithStatus: AnnouncementWithReadStatus = {
        ...mockAnnouncement,
        isRead: true,
        readAt: '2025-01-01T00:00:00Z',
      };
      component.announcement = announcementWithStatus;
      expect(component.isRead).toBe(true);
    });
  });

  describe('typeIcon', () => {
    it('should return build icon for maintenance type', () => {
      component.announcement = { ...mockAnnouncement, type: 'maintenance' };
      expect(component.typeIcon).toBe('build');
    });

    it('should return update icon for update type', () => {
      component.announcement = { ...mockAnnouncement, type: 'update' };
      expect(component.typeIcon).toBe('update');
    });

    it('should return campaign icon for announcement type', () => {
      component.announcement = { ...mockAnnouncement, type: 'announcement' };
      expect(component.typeIcon).toBe('campaign');
    });

    it('should return campaign icon for unknown type', () => {
      component.announcement = {
        ...mockAnnouncement,
        type: 'unknown' as any,
      };
      expect(component.typeIcon).toBe('campaign');
    });
  });

  describe('typeLabel', () => {
    it('should return Maintenance for maintenance type', () => {
      component.announcement = { ...mockAnnouncement, type: 'maintenance' };
      expect(component.typeLabel).toBe('Maintenance');
    });

    it('should return Update for update type', () => {
      component.announcement = { ...mockAnnouncement, type: 'update' };
      expect(component.typeLabel).toBe('Update');
    });

    it('should return Announcement for announcement type', () => {
      component.announcement = { ...mockAnnouncement, type: 'announcement' };
      expect(component.typeLabel).toBe('Announcement');
    });

    it('should return Announcement for unknown type', () => {
      component.announcement = {
        ...mockAnnouncement,
        type: 'unknown' as any,
      };
      expect(component.typeLabel).toBe('Announcement');
    });
  });

  describe('priorityClass', () => {
    it('should return priority-normal for normal priority', () => {
      component.announcement = { ...mockAnnouncement, priority: 'normal' };
      expect(component.priorityClass).toBe('priority-normal');
    });

    it('should return priority-high for high priority', () => {
      component.announcement = { ...mockAnnouncement, priority: 'high' };
      expect(component.priorityClass).toBe('priority-high');
    });

    it('should return priority-low for low priority', () => {
      component.announcement = { ...mockAnnouncement, priority: 'low' };
      expect(component.priorityClass).toBe('priority-low');
    });
  });

  describe('onMarkAsRead', () => {
    it('should emit markAsRead when announcement is unread', () => {
      const announcementWithStatus: AnnouncementWithReadStatus = {
        ...mockAnnouncement,
        isRead: false,
        readAt: null,
      };
      component.announcement = announcementWithStatus;

      const emitSpy = vi.spyOn(component.markAsRead, 'emit');
      component.onMarkAsRead();

      expect(emitSpy).toHaveBeenCalledWith('1');
    });

    it('should not emit markAsRead when announcement is already read', () => {
      const announcementWithStatus: AnnouncementWithReadStatus = {
        ...mockAnnouncement,
        isRead: true,
        readAt: '2025-01-01T00:00:00Z',
      };
      component.announcement = announcementWithStatus;

      const emitSpy = vi.spyOn(component.markAsRead, 'emit');
      component.onMarkAsRead();

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });
});
