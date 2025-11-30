import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'bun:test';
import { getDatabase } from '../src/db/index.js';
import { users, projects, documentSnapshots } from '../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { documentSnapshotService } from '../src/services/document-snapshot.service.js';
import { startTestServer, stopTestServer } from './server-test-helper.js';

describe('Document Snapshot Service', () => {
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Start test server to initialize the database
    await startTestServer();
  });

  afterAll(async () => {
    await stopTestServer();
  });

  beforeEach(async () => {
    const db = getDatabase();

    // Clean up test data
    await db.delete(documentSnapshots).where(eq(documentSnapshots.name, 'Test Snapshot'));
    await db.delete(documentSnapshots).where(eq(documentSnapshots.name, 'Snapshot 1'));
    await db.delete(documentSnapshots).where(eq(documentSnapshots.name, 'Snapshot 2'));
    await db.delete(documentSnapshots).where(eq(documentSnapshots.name, 'Other Snapshot'));
    await db.delete(projects).where(eq(projects.slug, 'snapshot-test-project'));
    await db.delete(users).where(eq(users.username, 'snapshotuser'));

    // Create test user
    testUserId = crypto.randomUUID();
    await db.insert(users).values({
      id: testUserId,
      username: 'snapshotuser',
      email: 'snapshot@example.com',
      approved: true,
      enabled: true,
    });

    // Create test project
    testProjectId = crypto.randomUUID();
    await db.insert(projects).values({
      id: testProjectId,
      slug: 'snapshot-test-project',
      title: 'Snapshot Test Project',
      userId: testUserId,
      createdDate: Date.now(),
      updatedDate: Date.now(),
    });
  });

  describe('findById', () => {
    it('should find snapshot by ID', async () => {
      const db = getDatabase();
      const snapshotId = crypto.randomUUID();
      const yDocState = Buffer.from('test-ydoc-state');

      await db.insert(documentSnapshots).values({
        id: snapshotId,
        documentId: 'doc-1',
        projectId: testProjectId,
        userId: testUserId,
        name: 'Test Snapshot',
        yDocState,
        createdAt: Date.now(),
      });

      const found = await documentSnapshotService.findById(db, snapshotId);
      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Snapshot');
      expect(found?.documentId).toBe('doc-1');
    });

    it('should return undefined for non-existent ID', async () => {
      const db = getDatabase();
      const found = await documentSnapshotService.findById(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findByProjectId', () => {
    it('should find all snapshots for a project', async () => {
      const db = getDatabase();
      const yDocState = Buffer.from('test-ydoc-state');
      const now = Date.now();

      await db.insert(documentSnapshots).values([
        {
          id: crypto.randomUUID(),
          documentId: 'doc-1',
          projectId: testProjectId,
          userId: testUserId,
          name: 'Snapshot 1',
          yDocState,
          createdAt: now - 1000, // older
        },
        {
          id: crypto.randomUUID(),
          documentId: 'doc-2',
          projectId: testProjectId,
          userId: testUserId,
          name: 'Snapshot 2',
          yDocState,
          createdAt: now, // newer
        },
      ]);

      const snapshots = await documentSnapshotService.findByProjectId(db, testProjectId);
      expect(snapshots.length).toBe(2);

      // Should be ordered by createdAt desc (newest first)
      expect(snapshots[0].name).toBe('Snapshot 2');
      expect(snapshots[1].name).toBe('Snapshot 1');
    });

    it('should return empty array for project with no snapshots', async () => {
      const db = getDatabase();
      const snapshots = await documentSnapshotService.findByProjectId(db, 'empty-project-id');
      expect(snapshots).toEqual([]);
    });
  });

  describe('findByDocumentId', () => {
    it('should find all snapshots for a specific document', async () => {
      const db = getDatabase();
      const yDocState = Buffer.from('test-ydoc-state');
      const now = Date.now();

      await db.insert(documentSnapshots).values([
        {
          id: crypto.randomUUID(),
          documentId: 'target-doc',
          projectId: testProjectId,
          userId: testUserId,
          name: 'Snapshot 1',
          yDocState,
          createdAt: now - 1000,
        },
        {
          id: crypto.randomUUID(),
          documentId: 'target-doc',
          projectId: testProjectId,
          userId: testUserId,
          name: 'Snapshot 2',
          yDocState,
          createdAt: now,
        },
        {
          id: crypto.randomUUID(),
          documentId: 'other-doc',
          projectId: testProjectId,
          userId: testUserId,
          name: 'Other Snapshot',
          yDocState,
          createdAt: now,
        },
      ]);

      const snapshots = await documentSnapshotService.findByDocumentId(
        db,
        testProjectId,
        'target-doc'
      );
      expect(snapshots.length).toBe(2);
      expect(snapshots.every((s) => s.documentId === 'target-doc')).toBe(true);

      // Should be ordered by createdAt desc
      expect(snapshots[0].name).toBe('Snapshot 2');
    });

    it('should return empty array for document with no snapshots', async () => {
      const db = getDatabase();
      const snapshots = await documentSnapshotService.findByDocumentId(
        db,
        testProjectId,
        'no-snapshots-doc'
      );
      expect(snapshots).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a new snapshot with all fields', async () => {
      const db = getDatabase();
      const yDocState = Buffer.from('full-ydoc-state');
      const stateVector = Buffer.from('state-vector-data');
      const metadata = { editor: 'prosemirror', version: 1 };

      const snapshot = await documentSnapshotService.create(db, {
        documentId: 'doc-create-test',
        projectId: testProjectId,
        userId: testUserId,
        name: 'Test Snapshot',
        description: 'A test snapshot description',
        yDocState,
        stateVector,
        wordCount: 500,
        metadata,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.documentId).toBe('doc-create-test');
      expect(snapshot.projectId).toBe(testProjectId);
      expect(snapshot.userId).toBe(testUserId);
      expect(snapshot.name).toBe('Test Snapshot');
      expect(snapshot.description).toBe('A test snapshot description');
      expect(snapshot.yDocState).toEqual(yDocState);
      expect(snapshot.stateVector).toEqual(stateVector);
      expect(snapshot.wordCount).toBe(500);
      expect(snapshot.metadata).toEqual(metadata);
      expect(snapshot.createdAt).toBeGreaterThan(0);
    });

    it('should create snapshot with minimal required fields', async () => {
      const db = getDatabase();
      const yDocState = Buffer.from('minimal-ydoc-state');

      const snapshot = await documentSnapshotService.create(db, {
        documentId: 'doc-minimal',
        projectId: testProjectId,
        userId: testUserId,
        name: 'Test Snapshot',
        yDocState,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.description).toBeNull();
      expect(snapshot.stateVector).toBeNull();
      expect(snapshot.wordCount).toBeNull();
      expect(snapshot.metadata).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a snapshot', async () => {
      const db = getDatabase();
      const yDocState = Buffer.from('delete-test');
      const snapshotId = crypto.randomUUID();

      await db.insert(documentSnapshots).values({
        id: snapshotId,
        documentId: 'doc-delete',
        projectId: testProjectId,
        userId: testUserId,
        name: 'Test Snapshot',
        yDocState,
        createdAt: Date.now(),
      });

      // Verify it exists
      const before = await documentSnapshotService.findById(db, snapshotId);
      expect(before).toBeDefined();

      // Delete it
      await documentSnapshotService.delete(db, snapshotId);

      // Verify it's gone
      const after = await documentSnapshotService.findById(db, snapshotId);
      expect(after).toBeUndefined();
    });

    it('should not throw when deleting non-existent snapshot', async () => {
      const db = getDatabase();
      // Should not throw
      await documentSnapshotService.delete(db, 'non-existent-id');
    });
  });
});
