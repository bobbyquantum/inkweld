import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnnouncementService,
  AnnouncementServiceError,
} from './announcement.service';

describe('AnnouncementService', () => {
  let service: AnnouncementService;
  let httpMock: {
    request: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const mockAnnouncement = {
    id: '1',
    title: 'Test Announcement',
    content: 'Test content',
    type: 'announcement' as const,
    priority: 'normal' as const,
    isPublic: true,
    publishedAt: '2024-01-01T00:00:00.000Z',
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    createdBy: 'admin',
  };

  const mockAnnouncementWithReadStatus = {
    ...mockAnnouncement,
    isRead: false,
    readAt: null,
  };

  beforeEach(() => {
    httpMock = {
      request: vi.fn().mockReturnValue(of([])),
      get: vi.fn().mockReturnValue(of([])),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn().mockReturnValue(of({})),
      delete: vi.fn().mockReturnValue(of({})),
    };

    TestBed.configureTestingModule({
      providers: [
        AnnouncementService,
        { provide: HttpClient, useValue: httpMock },
      ],
    });

    service = TestBed.inject(AnnouncementService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have empty initial state', () => {
      expect(service.publicAnnouncements()).toEqual([]);
      expect(service.announcements()).toEqual([]);
      expect(service.adminAnnouncements()).toEqual([]);
      expect(service.unreadCount()).toBe(0);
      expect(service.isLoading()).toBe(false);
      expect(service.hasUnread()).toBe(false);
    });
  });

  describe('loadPublicAnnouncements', () => {
    it('should load public announcements', async () => {
      httpMock.request.mockReturnValue(of([mockAnnouncement]));

      const result = await service.loadPublicAnnouncements();

      expect(result).toEqual([mockAnnouncement]);
      expect(service.publicAnnouncements()).toEqual([mockAnnouncement]);
    });

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false;
      httpMock.request.mockImplementation(() => {
        loadingDuringFetch = service.isLoading();
        return of([mockAnnouncement]);
      });

      await service.loadPublicAnnouncements();

      expect(loadingDuringFetch).toBe(true);
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('loadAnnouncements', () => {
    it('should load announcements with read status', async () => {
      httpMock.request.mockReturnValue(of([mockAnnouncementWithReadStatus]));

      const result = await service.loadAnnouncements();

      expect(result).toEqual([mockAnnouncementWithReadStatus]);
      expect(service.announcements()).toEqual([mockAnnouncementWithReadStatus]);
    });

    it('should update unread count', async () => {
      const unreadAnnouncement = {
        ...mockAnnouncementWithReadStatus,
        isRead: false,
      };
      const readAnnouncement = {
        ...mockAnnouncementWithReadStatus,
        id: '2',
        isRead: true,
      };
      httpMock.request.mockReturnValue(
        of([unreadAnnouncement, readAnnouncement])
      );

      await service.loadAnnouncements();

      expect(service.unreadCount()).toBe(1);
      expect(service.hasUnread()).toBe(true);
    });
  });

  describe('loadUnreadCount', () => {
    it('should load unread count', async () => {
      httpMock.request.mockReturnValue(of({ count: 5 }));

      const result = await service.loadUnreadCount();

      expect(result).toBe(5);
      expect(service.unreadCount()).toBe(5);
    });

    it('should return 0 on error', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: 'error',
              status: 500,
              statusText: 'Server Error',
            })
        )
      );

      const result = await service.loadUnreadCount();

      expect(result).toBe(0);
    });
  });

  describe('markAsRead', () => {
    it('should mark announcement as read', async () => {
      // First load announcements
      httpMock.request.mockReturnValue(of([mockAnnouncementWithReadStatus]));
      await service.loadAnnouncements();

      // Then mark as read
      httpMock.request.mockReturnValue(of({}));
      await service.markAsRead('1');

      const announcements = service.announcements();
      expect(announcements[0].isRead).toBe(true);
      expect(announcements[0].readAt).toBeTruthy();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all announcements as read', async () => {
      // First load announcements
      const announcements = [
        { ...mockAnnouncementWithReadStatus, id: '1', isRead: false },
        { ...mockAnnouncementWithReadStatus, id: '2', isRead: false },
      ];
      httpMock.request.mockReturnValue(of(announcements));
      await service.loadAnnouncements();

      // Then mark all as read
      httpMock.request.mockReturnValue(of({}));
      await service.markAllAsRead();

      const result = service.announcements();
      expect(result.every(a => a.isRead)).toBe(true);
      expect(service.unreadCount()).toBe(0);
    });
  });

  describe('admin operations', () => {
    describe('loadAdminAnnouncements', () => {
      it('should load all announcements for admin', async () => {
        httpMock.request.mockReturnValue(of([mockAnnouncement]));

        const result = await service.loadAdminAnnouncements();

        expect(result).toEqual([mockAnnouncement]);
        expect(service.adminAnnouncements()).toEqual([mockAnnouncement]);
      });
    });

    describe('getAnnouncement', () => {
      it('should get single announcement', async () => {
        httpMock.request.mockReturnValue(of(mockAnnouncement));

        const result = await service.getAnnouncement('1');

        expect(result).toEqual(mockAnnouncement);
      });
    });

    describe('createAnnouncement', () => {
      it('should create announcement and add to state', async () => {
        httpMock.request.mockReturnValue(of(mockAnnouncement));

        const result = await service.createAnnouncement({
          title: 'Test',
          content: 'Content',
        });

        expect(result).toEqual(mockAnnouncement);
        expect(service.adminAnnouncements()).toContainEqual(mockAnnouncement);
      });
    });

    describe('updateAnnouncement', () => {
      it('should update announcement and update state', async () => {
        // First load announcements
        httpMock.request.mockReturnValue(of([mockAnnouncement]));
        await service.loadAdminAnnouncements();

        // Then update
        const updatedAnnouncement = { ...mockAnnouncement, title: 'Updated' };
        httpMock.request.mockReturnValue(of(updatedAnnouncement));

        const result = await service.updateAnnouncement('1', {
          title: 'Updated',
        });

        expect(result.title).toBe('Updated');
        expect(service.adminAnnouncements()[0].title).toBe('Updated');
      });
    });

    describe('deleteAnnouncement', () => {
      it('should delete announcement and remove from state', async () => {
        // First load announcements
        httpMock.request.mockReturnValue(of([mockAnnouncement]));
        await service.loadAdminAnnouncements();

        // Then delete
        httpMock.request.mockReturnValue(of({}));
        await service.deleteAnnouncement('1');

        expect(service.adminAnnouncements()).toEqual([]);
      });
    });

    describe('publishAnnouncement', () => {
      it('should publish announcement and update state', async () => {
        const draftAnnouncement = { ...mockAnnouncement, publishedAt: null };
        httpMock.request.mockReturnValue(of([draftAnnouncement]));
        await service.loadAdminAnnouncements();

        const publishedAnnouncement = {
          ...draftAnnouncement,
          publishedAt: '2024-01-01T00:00:00.000Z',
        };
        httpMock.request.mockReturnValue(of(publishedAnnouncement));

        const result = await service.publishAnnouncement('1');

        expect(result.publishedAt).toBeTruthy();
        expect(service.adminAnnouncements()[0].publishedAt).toBeTruthy();
      });
    });

    describe('unpublishAnnouncement', () => {
      it('should unpublish announcement and update state', async () => {
        httpMock.request.mockReturnValue(of([mockAnnouncement]));
        await service.loadAdminAnnouncements();

        const unpublishedAnnouncement = {
          ...mockAnnouncement,
          publishedAt: null,
        };
        httpMock.request.mockReturnValue(of(unpublishedAnnouncement));

        const result = await service.unpublishAnnouncement('1');

        expect(result.publishedAt).toBeNull();
        expect(service.adminAnnouncements()[0].publishedAt).toBeNull();
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: new ErrorEvent('Network error'),
              status: 0,
              statusText: 'Unknown Error',
            })
        )
      );

      await expect(service.loadPublicAnnouncements()).rejects.toBeInstanceOf(
        AnnouncementServiceError
      );
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('should handle 401 unauthorized', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: 'Unauthorized',
              status: 401,
              statusText: 'Unauthorized',
            })
        )
      );

      await expect(service.loadAnnouncements()).rejects.toBeInstanceOf(
        AnnouncementServiceError
      );
      expect(service.error()?.code).toBe('UNAUTHORIZED');
    });

    it('should handle 403 forbidden', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: 'Forbidden',
              status: 403,
              statusText: 'Forbidden',
            })
        )
      );

      await expect(service.loadAdminAnnouncements()).rejects.toBeInstanceOf(
        AnnouncementServiceError
      );
      expect(service.error()?.code).toBe('FORBIDDEN');
    });

    it('should handle 404 not found', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: 'Not Found',
              status: 404,
              statusText: 'Not Found',
            })
        )
      );

      await expect(service.getAnnouncement('999')).rejects.toBeInstanceOf(
        AnnouncementServiceError
      );
      expect(service.error()?.code).toBe('NOT_FOUND');
    });

    it('should handle 500 server error', async () => {
      httpMock.request.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              error: { message: 'Internal Server Error' },
              status: 500,
              statusText: 'Internal Server Error',
            })
        )
      );

      await expect(service.loadPublicAnnouncements()).rejects.toBeInstanceOf(
        AnnouncementServiceError
      );
      expect(service.error()?.code).toBe('SERVER_ERROR');
    });
  });
});
