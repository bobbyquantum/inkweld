import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AdminCreateAnnouncementRequest,
  AdminCreateAnnouncementRequestPriority,
  AdminCreateAnnouncementRequestType,
  AdminService as ApiAdminService,
  AdminUpdateAnnouncementRequest,
  AdminUpdateAnnouncementRequestPriority,
  AdminUpdateAnnouncementRequestType,
  AnnouncementsService as ApiAnnouncementsService,
} from '@inkweld/index';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { LoggerService } from '../core/logger.service';

export class AnnouncementServiceError extends Error {
  constructor(
    public code:
      | 'NETWORK_ERROR'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'AnnouncementServiceError';
  }
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'announcement' | 'update' | 'maintenance';
  priority: 'low' | 'normal' | 'high';
  isPublic: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AnnouncementWithReadStatus extends Announcement {
  isRead: boolean;
  readAt: string | null;
}

export interface CreateAnnouncementData {
  title: string;
  content: string;
  type?: 'announcement' | 'update' | 'maintenance';
  priority?: 'low' | 'normal' | 'high';
  isPublic?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
}

export interface UpdateAnnouncementData {
  title?: string;
  content?: string;
  type?: 'announcement' | 'update' | 'maintenance';
  priority?: 'low' | 'normal' | 'high';
  isPublic?: boolean;
  publishedAt?: string | null;
  expiresAt?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  private readonly apiService = inject(ApiAnnouncementsService);
  private readonly adminApiService = inject(ApiAdminService);
  private readonly logger = inject(LoggerService);

  // Public announcements (for unauthenticated users)
  readonly publicAnnouncements = signal<Announcement[]>([]);

  // User announcements with read status
  readonly announcements = signal<AnnouncementWithReadStatus[]>([]);

  // Admin: all announcements including drafts
  readonly adminAnnouncements = signal<Announcement[]>([]);

  // Unread count
  readonly unreadCount = signal(0);

  // Loading states
  readonly isLoading = signal(false);
  readonly isLoadingAdmin = signal(false);
  readonly error = signal<AnnouncementServiceError | undefined>(undefined);

  // Computed: has unread announcements
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  /**
   * Fetch public announcements (no auth required)
   */
  async loadPublicAnnouncements(): Promise<Announcement[]> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const announcements = await firstValueFrom(
        this.apiService
          .listPublicAnnouncements()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.publicAnnouncements.set(announcements as Announcement[]);
      return announcements as Announcement[];
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to load public announcements',
        error
      );
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Fetch announcements with read status for authenticated user
   */
  async loadAnnouncements(): Promise<AnnouncementWithReadStatus[]> {
    this.isLoading.set(true);
    this.error.set(undefined);

    try {
      const announcements = await firstValueFrom(
        this.apiService
          .listAnnouncements()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.announcements.set(announcements as AnnouncementWithReadStatus[]);
      this.updateUnreadCount();
      return announcements as AnnouncementWithReadStatus[];
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to load announcements',
        error
      );
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Fetch unread count for authenticated user
   */
  async loadUnreadCount(): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.apiService
          .getUnreadAnnouncementCount()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.unreadCount.set(response.count);
      return response.count;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to load unread count',
        error
      );
      // Don't throw - this is a non-critical operation
      return 0;
    }
  }

  /**
   * Mark a single announcement as read
   */
  async markAsRead(announcementId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.apiService
          .markAnnouncementAsRead(announcementId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.announcements.update(announcements =>
        announcements.map(a =>
          a.id === announcementId
            ? { ...a, isRead: true, readAt: new Date().toISOString() }
            : a
        )
      );
      this.updateUnreadCount();
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to mark announcement as read',
        error
      );
      throw error;
    }
  }

  /**
   * Mark all announcements as read
   */
  async markAllAsRead(): Promise<void> {
    try {
      await firstValueFrom(
        this.apiService
          .markAllAnnouncementsAsRead()
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      const now = new Date().toISOString();
      this.announcements.update(announcements =>
        announcements.map(a => ({ ...a, isRead: true, readAt: now }))
      );
      this.unreadCount.set(0);
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to mark all as read',
        error
      );
      throw error;
    }
  }

  // ========================================
  // Admin methods
  // ========================================

  /**
   * Fetch all announcements including drafts (admin only)
   */
  async loadAdminAnnouncements(): Promise<Announcement[]> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      const announcements = await firstValueFrom(
        this.adminApiService
          .adminListAnnouncements()
          .pipe(catchError(this.handleError.bind(this)))
      );

      this.adminAnnouncements.set(announcements as Announcement[]);
      return announcements as Announcement[];
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to load admin announcements',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  /**
   * Get a single announcement (admin only)
   */
  async getAnnouncement(announcementId: string): Promise<Announcement> {
    try {
      const announcement = await firstValueFrom(
        this.adminApiService
          .adminGetAnnouncement(announcementId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      return announcement as Announcement;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to get announcement',
        error
      );
      throw error;
    }
  }

  /**
   * Create a new announcement (admin only)
   */
  async createAnnouncement(
    data: CreateAnnouncementData
  ): Promise<Announcement> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      const request: AdminCreateAnnouncementRequest = {
        title: data.title,
        content: data.content,
        type: data.type as AdminCreateAnnouncementRequestType | undefined,
        priority: data.priority as
          | AdminCreateAnnouncementRequestPriority
          | undefined,
        isPublic: data.isPublic,
        publishedAt: data.publishedAt,
        expiresAt: data.expiresAt,
      };
      const announcement = await firstValueFrom(
        this.adminApiService
          .adminCreateAnnouncement(request)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Add to local state
      this.adminAnnouncements.update(announcements => [
        announcement as Announcement,
        ...announcements,
      ]);

      return announcement as Announcement;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to create announcement',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  /**
   * Update an announcement (admin only)
   */
  async updateAnnouncement(
    announcementId: string,
    data: UpdateAnnouncementData
  ): Promise<Announcement> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      const request: AdminUpdateAnnouncementRequest = {
        title: data.title,
        content: data.content,
        type: data.type as AdminUpdateAnnouncementRequestType | undefined,
        priority: data.priority as
          | AdminUpdateAnnouncementRequestPriority
          | undefined,
        isPublic: data.isPublic,
        publishedAt: data.publishedAt,
        expiresAt: data.expiresAt,
      };
      const announcement = await firstValueFrom(
        this.adminApiService
          .adminUpdateAnnouncement(announcementId, request)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.adminAnnouncements.update(announcements =>
        announcements.map(a =>
          a.id === announcementId ? (announcement as Announcement) : a
        )
      );

      return announcement as Announcement;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to update announcement',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  /**
   * Delete an announcement (admin only)
   */
  async deleteAnnouncement(announcementId: string): Promise<void> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      await firstValueFrom(
        this.adminApiService
          .adminDeleteAnnouncement(announcementId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Remove from local state
      this.adminAnnouncements.update(announcements =>
        announcements.filter(a => a.id !== announcementId)
      );
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to delete announcement',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  /**
   * Publish a draft announcement (admin only)
   */
  async publishAnnouncement(announcementId: string): Promise<Announcement> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      const announcement = await firstValueFrom(
        this.adminApiService
          .adminPublishAnnouncement(announcementId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.adminAnnouncements.update(announcements =>
        announcements.map(a =>
          a.id === announcementId ? (announcement as Announcement) : a
        )
      );

      return announcement as Announcement;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to publish announcement',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  /**
   * Unpublish an announcement (admin only)
   */
  async unpublishAnnouncement(announcementId: string): Promise<Announcement> {
    this.isLoadingAdmin.set(true);
    this.error.set(undefined);

    try {
      const announcement = await firstValueFrom(
        this.adminApiService
          .adminUnpublishAnnouncement(announcementId)
          .pipe(catchError(this.handleError.bind(this)))
      );

      // Update local state
      this.adminAnnouncements.update(announcements =>
        announcements.map(a =>
          a.id === announcementId ? (announcement as Announcement) : a
        )
      );

      return announcement as Announcement;
    } catch (error) {
      this.logger.error(
        'AnnouncementService',
        'Failed to unpublish announcement',
        error
      );
      throw error;
    } finally {
      this.isLoadingAdmin.set(false);
    }
  }

  // ========================================
  // Private helpers
  // ========================================

  private updateUnreadCount(): void {
    const unread = this.announcements().filter(a => !a.isRead).length;
    this.unreadCount.set(unread);
  }

  private handleError(error: HttpErrorResponse) {
    let serviceError: AnnouncementServiceError;

    if (error.status === 0) {
      serviceError = new AnnouncementServiceError(
        'NETWORK_ERROR',
        'Unable to connect to server'
      );
    } else if (error.status === 401) {
      serviceError = new AnnouncementServiceError(
        'UNAUTHORIZED',
        'Authentication required'
      );
    } else if (error.status === 403) {
      serviceError = new AnnouncementServiceError('FORBIDDEN', 'Access denied');
    } else if (error.status === 404) {
      serviceError = new AnnouncementServiceError(
        'NOT_FOUND',
        'Announcement not found'
      );
    } else {
      let errorMessage = 'Server error occurred';
      const errorBody: unknown = error.error;
      if (
        typeof errorBody === 'object' &&
        errorBody !== null &&
        'message' in errorBody
      ) {
        const msg = (errorBody as { message: unknown }).message;
        if (typeof msg === 'string') {
          errorMessage = msg;
        }
      }
      serviceError = new AnnouncementServiceError('SERVER_ERROR', errorMessage);
    }

    this.error.set(serviceError);
    return throwError(() => serviceError);
  }
}
