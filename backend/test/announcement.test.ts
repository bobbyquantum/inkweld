import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database as BunDatabase } from 'bun:sqlite';
import { join } from 'path';
import * as schema from '../src/db/schema';
import { announcementService } from '../src/services/announcement.service';
import { announcements, announcementReads } from '../src/db/schema';
import { users } from '../src/db/schema/users';

let db: BunSQLiteDatabase<typeof schema>;
let sqlite: BunDatabase;
let testUserId: string;
let testAdminId: string;

beforeAll(async () => {
  // Create in-memory database for tests
  sqlite = new BunDatabase(':memory:');
  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = join(__dirname, '../drizzle');
  await migrate(db, { migrationsFolder });

  // Create test users
  testUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: testUserId,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: 'hash',
    approved: true,
    enabled: true,
    isAdmin: false,
  });

  testAdminId = crypto.randomUUID();
  await db.insert(users).values({
    id: testAdminId,
    username: 'admin',
    email: 'admin@example.com',
    passwordHash: 'hash',
    approved: true,
    enabled: true,
    isAdmin: true,
  });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(async () => {
  // Clear announcements and reads before each test
  await db.delete(announcementReads);
  await db.delete(announcements);
});

describe('AnnouncementService', () => {
  describe('create', () => {
    it('should create an announcement with default values', async () => {
      const announcement = await announcementService.create(
        db,
        { title: 'Test Announcement', content: 'Test content' },
        testAdminId
      );

      expect(announcement.id).toBeDefined();
      expect(announcement.title).toBe('Test Announcement');
      expect(announcement.content).toBe('Test content');
      expect(announcement.type).toBe('announcement');
      expect(announcement.priority).toBe('normal');
      expect(announcement.isPublic).toBe(true);
      expect(announcement.publishedAt).toBeNull();
      expect(announcement.createdBy).toBe(testAdminId);
    });

    it('should create an announcement with custom values', async () => {
      const now = new Date();
      const expires = new Date(Date.now() + 86400000);

      const announcement = await announcementService.create(
        db,
        {
          title: 'Maintenance Notice',
          content: 'System maintenance scheduled',
          type: 'maintenance',
          priority: 'high',
          isPublic: false,
          publishedAt: now,
          expiresAt: expires,
        },
        testAdminId
      );

      expect(announcement.type).toBe('maintenance');
      expect(announcement.priority).toBe('high');
      expect(announcement.isPublic).toBe(false);
      // SQLite stores timestamps with second precision, so compare within 1 second
      expect(announcement.publishedAt).toBeDefined();
      expect(announcement.expiresAt).toBeDefined();
      expect(Math.abs((announcement.publishedAt as Date).getTime() - now.getTime())).toBeLessThan(
        1000
      );
      expect(Math.abs((announcement.expiresAt as Date).getTime() - expires.getTime())).toBeLessThan(
        1000
      );
    });
  });

  describe('findById', () => {
    it('should find announcement by ID', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Find Me', content: 'Content' },
        testAdminId
      );

      const found = await announcementService.findById(db, created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Find Me');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await announcementService.findById(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('listAll', () => {
    it('should list all announcements', async () => {
      await announcementService.create(db, { title: 'First', content: 'Content 1' }, testAdminId);
      await announcementService.create(db, { title: 'Second', content: 'Content 2' }, testAdminId);
      await announcementService.create(db, { title: 'Third', content: 'Content 3' }, testAdminId);

      const all = await announcementService.listAll(db);

      expect(all.length).toBe(3);
      // All titles should be present
      const titles = all.map((a) => a.title).sort();
      expect(titles).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('listPublished', () => {
    it('should list only published announcements', async () => {
      // Published
      await announcementService.create(
        db,
        { title: 'Published', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      // Draft (not published)
      await announcementService.create(db, { title: 'Draft', content: 'Content' }, testAdminId);

      const published = await announcementService.listPublished(db);

      expect(published.length).toBe(1);
      expect(published[0].title).toBe('Published');
    });

    it('should exclude expired announcements', async () => {
      const pastDate = new Date(Date.now() - 86400000);

      await announcementService.create(
        db,
        { title: 'Expired', content: 'Content', publishedAt: pastDate, expiresAt: pastDate },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Active', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      const published = await announcementService.listPublished(db);

      expect(published.length).toBe(1);
      expect(published[0].title).toBe('Active');
    });

    it('should filter public only when requested', async () => {
      await announcementService.create(
        db,
        { title: 'Public', content: 'Content', publishedAt: new Date(), isPublic: true },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Private', content: 'Content', publishedAt: new Date(), isPublic: false },
        testAdminId
      );

      const publicOnly = await announcementService.listPublished(db, { publicOnly: true });
      const all = await announcementService.listPublished(db, { publicOnly: false });

      expect(publicOnly.length).toBe(1);
      expect(publicOnly[0].title).toBe('Public');
      expect(all.length).toBe(2);
    });
  });

  describe('update', () => {
    it('should update announcement fields', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Original', content: 'Original content' },
        testAdminId
      );

      const updated = await announcementService.update(db, created.id, {
        title: 'Updated Title',
        content: 'Updated content',
        priority: 'high',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.content).toBe('Updated content');
      expect(updated.priority).toBe('high');
    });

    it('should set updatedAt on update', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Test', content: 'Content' },
        testAdminId
      );

      const updated = await announcementService.update(db, created.id, { title: 'New Title' });

      // updatedAt should be set (at least same as or after original)
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
      expect(updated.title).toBe('New Title');
    });
  });

  describe('delete', () => {
    it('should delete an announcement', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Delete Me', content: 'Content' },
        testAdminId
      );

      await announcementService.delete(db, created.id);

      const found = await announcementService.findById(db, created.id);
      expect(found).toBeUndefined();
    });
  });

  describe('publish and unpublish', () => {
    it('should publish an announcement', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Draft', content: 'Content' },
        testAdminId
      );

      expect(created.publishedAt).toBeNull();

      const published = await announcementService.publish(db, created.id);

      expect(published.publishedAt).not.toBeNull();
    });

    it('should unpublish an announcement', async () => {
      const created = await announcementService.create(
        db,
        { title: 'Published', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      const unpublished = await announcementService.unpublish(db, created.id);

      expect(unpublished.publishedAt).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('should mark an announcement as read for a user', async () => {
      const announcement = await announcementService.create(
        db,
        { title: 'Read Me', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAsRead(db, announcement.id, testUserId);

      const withStatus = await announcementService.listPublishedWithReadStatus(db, testUserId);
      const item = withStatus.find((a) => a.id === announcement.id);

      expect(item?.isRead).toBe(true);
      expect(item?.readAt).not.toBeNull();
    });

    it('should not create duplicate read records', async () => {
      const announcement = await announcementService.create(
        db,
        { title: 'Read Me', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAsRead(db, announcement.id, testUserId);
      await announcementService.markAsRead(db, announcement.id, testUserId);

      // Should not throw, and should still have only one read record
      const reads = await db.select().from(announcementReads);
      const userReads = reads.filter(
        (r) => r.userId === testUserId && r.announcementId === announcement.id
      );
      expect(userReads.length).toBe(1);
    });
  });

  describe('listPublishedWithReadStatus', () => {
    it('should return announcements with read status', async () => {
      const ann1 = await announcementService.create(
        db,
        { title: 'Read', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Unread', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAsRead(db, ann1.id, testUserId);

      const withStatus = await announcementService.listPublishedWithReadStatus(db, testUserId);

      expect(withStatus.length).toBe(2);
      const readItem = withStatus.find((a) => a.title === 'Read');
      const unreadItem = withStatus.find((a) => a.title === 'Unread');

      expect(readItem?.isRead).toBe(true);
      expect(unreadItem?.isRead).toBe(false);
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread announcements', async () => {
      const ann1 = await announcementService.create(
        db,
        { title: 'Read', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Unread 1', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Unread 2', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAsRead(db, ann1.id, testUserId);

      const count = await announcementService.getUnreadCount(db, testUserId);

      expect(count).toBe(2);
    });

    it('should return 0 when all are read', async () => {
      const ann1 = await announcementService.create(
        db,
        { title: 'Announcement', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAsRead(db, ann1.id, testUserId);

      const count = await announcementService.getUnreadCount(db, testUserId);

      expect(count).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all announcements as read', async () => {
      await announcementService.create(
        db,
        { title: 'Ann 1', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Ann 2', content: 'Content', publishedAt: new Date() },
        testAdminId
      );
      await announcementService.create(
        db,
        { title: 'Ann 3', content: 'Content', publishedAt: new Date() },
        testAdminId
      );

      await announcementService.markAllAsRead(db, testUserId);

      const count = await announcementService.getUnreadCount(db, testUserId);
      expect(count).toBe(0);
    });

    it('should not fail if there are no unread announcements', async () => {
      // No announcements at all
      await announcementService.markAllAsRead(db, testUserId);

      const count = await announcementService.getUnreadCount(db, testUserId);
      expect(count).toBe(0);
    });
  });
});
