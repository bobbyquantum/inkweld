import { eq, and, or, isNull, lte, gte, desc, sql, isNotNull } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  announcements,
  announcementReads,
  type Announcement,
  type InsertAnnouncement,
} from '../db/schema';

export interface AnnouncementWithReadStatus extends Announcement {
  isRead: boolean;
  readAt: Date | null;
}

export interface CreateAnnouncementData {
  title: string;
  content: string;
  type?: 'announcement' | 'update' | 'maintenance';
  priority?: 'low' | 'normal' | 'high';
  isPublic?: boolean;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface UpdateAnnouncementData {
  title?: string;
  content?: string;
  type?: 'announcement' | 'update' | 'maintenance';
  priority?: 'low' | 'normal' | 'high';
  isPublic?: boolean;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
}

class AnnouncementService {
  /**
   * Find announcement by ID
   */
  async findById(db: DatabaseInstance, id: string): Promise<Announcement | undefined> {
    const result = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    return result[0];
  }

  /**
   * List all announcements (for admin)
   */
  async listAll(db: DatabaseInstance): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(desc(announcements.createdAt));
  }

  /**
   * List published announcements (public or all depending on auth)
   * For unauthenticated users: only isPublic=true and published
   * For authenticated users: all published announcements
   */
  async listPublished(
    db: DatabaseInstance,
    options: { publicOnly?: boolean } = {}
  ): Promise<Announcement[]> {
    const now = new Date();

    const baseConditions = and(
      isNotNull(announcements.publishedAt),
      lte(announcements.publishedAt, now),
      or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))
    );

    const conditions = options.publicOnly
      ? and(baseConditions, eq(announcements.isPublic, true))
      : baseConditions;

    return db
      .select()
      .from(announcements)
      .where(conditions)
      .orderBy(desc(announcements.publishedAt));
  }

  /**
   * List published announcements with read status for a user
   */
  async listPublishedWithReadStatus(
    db: DatabaseInstance,
    userId: string
  ): Promise<AnnouncementWithReadStatus[]> {
    const now = new Date();

    const result = await (db as any)
      .select({
        announcement: announcements,
        readAt: announcementReads.readAt,
      })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.userId, userId)
        )
      )
      .where(
        and(
          isNotNull(announcements.publishedAt),
          lte(announcements.publishedAt, now),
          or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now))
        )
      )
      .orderBy(desc(announcements.publishedAt));

    return result.map((row: any) => ({
      ...row.announcement,
      isRead: row.readAt !== null && row.readAt !== undefined,
      readAt: row.readAt || null,
    }));
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(db: DatabaseInstance, userId: string): Promise<number> {
    const now = new Date();

    const result = await (db as any)
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.userId, userId)
        )
      )
      .where(
        and(
          isNotNull(announcements.publishedAt),
          lte(announcements.publishedAt, now),
          or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)),
          isNull(announcementReads.id)
        )
      );

    return result[0]?.count ?? 0;
  }

  /**
   * Create a new announcement
   */
  async create(
    db: DatabaseInstance,
    data: CreateAnnouncementData,
    createdBy: string
  ): Promise<Announcement> {
    const id = crypto.randomUUID();
    const now = new Date();

    const newAnnouncement: InsertAnnouncement = {
      id,
      title: data.title,
      content: data.content,
      type: data.type ?? 'announcement',
      priority: data.priority ?? 'normal',
      isPublic: data.isPublic ?? true,
      publishedAt: data.publishedAt ?? null,
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    await db.insert(announcements).values(newAnnouncement);

    const created = await this.findById(db, id);
    if (!created) {
      throw new Error('Failed to create announcement');
    }
    return created;
  }

  /**
   * Update an announcement
   */
  async update(
    db: DatabaseInstance,
    id: string,
    data: UpdateAnnouncementData
  ): Promise<Announcement> {
    await db
      .update(announcements)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id));

    const updated = await this.findById(db, id);
    if (!updated) {
      throw new Error('Announcement not found');
    }
    return updated;
  }

  /**
   * Delete an announcement
   */
  async delete(db: DatabaseInstance, id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  /**
   * Publish an announcement (set publishedAt to now)
   */
  async publish(db: DatabaseInstance, id: string): Promise<Announcement> {
    return this.update(db, id, { publishedAt: new Date() });
  }

  /**
   * Unpublish an announcement (set publishedAt to null)
   */
  async unpublish(db: DatabaseInstance, id: string): Promise<Announcement> {
    return this.update(db, id, { publishedAt: null });
  }

  /**
   * Mark an announcement as read for a user
   */
  async markAsRead(db: DatabaseInstance, announcementId: string, userId: string): Promise<void> {
    // Check if already marked as read
    const existing = await db
      .select()
      .from(announcementReads)
      .where(
        and(
          eq(announcementReads.announcementId, announcementId),
          eq(announcementReads.userId, userId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(announcementReads).values({
        id: crypto.randomUUID(),
        announcementId,
        userId,
        readAt: new Date(),
      });
    }
  }

  /**
   * Mark all announcements as read for a user
   */
  async markAllAsRead(db: DatabaseInstance, userId: string): Promise<void> {
    const now = new Date();

    // Get all unread published announcements
    const unreadAnnouncements = await (db as any)
      .select({ id: announcements.id })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.userId, userId)
        )
      )
      .where(
        and(
          isNotNull(announcements.publishedAt),
          lte(announcements.publishedAt, now),
          or(isNull(announcements.expiresAt), gte(announcements.expiresAt, now)),
          isNull(announcementReads.id)
        )
      );

    // Insert read records for all unread announcements
    if (unreadAnnouncements.length > 0) {
      const readRecords = unreadAnnouncements.map((a: any) => ({
        id: crypto.randomUUID(),
        announcementId: a.id,
        userId,
        readAt: now,
      }));

      await db.insert(announcementReads).values(readRecords);
    }
  }
}

export const announcementService = new AnnouncementService();
