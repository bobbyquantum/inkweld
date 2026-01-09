import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagesComponent } from './messages.component';

describe('MessagesComponent', () => {
  let component: MessagesComponent;
  let fixture: ComponentFixture<MessagesComponent>;
  let mockAnnouncementService: {
    announcements: ReturnType<typeof signal>;
    hasUnread: ReturnType<typeof signal>;
    isLoading: ReturnType<typeof signal>;
    loadAnnouncements: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAnnouncementService = {
      announcements: signal([]),
      hasUnread: signal(false),
      isLoading: signal(false),
      loadAnnouncements: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      markAllAsRead: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [MessagesComponent, RouterModule.forRoot([])],
      providers: [
        { provide: AnnouncementService, useValue: mockAnnouncementService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MessagesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load messages on init', async () => {
    fixture.detectChanges();

    // Wait for async initialization
    await fixture.whenStable();

    expect(mockAnnouncementService.loadAnnouncements).toHaveBeenCalled();
  });

  it('should handle error when loading messages fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAnnouncementService.loadAnnouncements.mockRejectedValue(
      new Error('Network error')
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load messages',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('should mark announcement as read', async () => {
    await component.onMarkAsRead('announcement-1');

    expect(mockAnnouncementService.markAsRead).toHaveBeenCalledWith(
      'announcement-1'
    );
  });

  it('should handle error when marking as read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAnnouncementService.markAsRead.mockRejectedValue(
      new Error('Network error')
    );

    await component.onMarkAsRead('announcement-1');

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to mark as read',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('should mark all announcements as read', async () => {
    await component.onMarkAllAsRead();

    expect(mockAnnouncementService.markAllAsRead).toHaveBeenCalled();
  });

  it('should handle error when marking all as read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAnnouncementService.markAllAsRead.mockRejectedValue(
      new Error('Network error')
    );

    await component.onMarkAllAsRead();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to mark all as read',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it('should return true for hasAnnouncements when announcements exist', () => {
    mockAnnouncementService.announcements.set([
      { id: '1', title: 'Test', content: 'Content' },
    ]);

    expect(component.hasAnnouncements).toBe(true);
  });

  it('should return false for hasAnnouncements when no announcements', () => {
    mockAnnouncementService.announcements.set([]);

    expect(component.hasAnnouncements).toBe(false);
  });

  it('should return true for hasUnread when there are unread announcements', () => {
    mockAnnouncementService.hasUnread.set(true);

    expect(component.hasUnread).toBe(true);
  });

  it('should return false for hasUnread when no unread announcements', () => {
    mockAnnouncementService.hasUnread.set(false);

    expect(component.hasUnread).toBe(false);
  });
});
