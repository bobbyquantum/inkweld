import { eq, and, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import type { D1DatabaseInstance } from '../db/d1';
import {
  documentSnapshots,
  type DocumentSnapshot,
  type InsertDocumentSnapshot,
} from '../db/schema/document-snapshots';

/** A snapshot without its payload columns (xmlContent, worldbuildingData). */
export type DocumentSnapshotSummary = Omit<DocumentSnapshot, 'xmlContent' | 'worldbuildingData'>;

/**
 * Columns for list endpoints. Every snapshot row carries the full document
 * XML (and worldbuilding JSON); listing a project used to read and serialise
 * all of it just to render names and dates.
 */
const SUMMARY_COLUMNS = {
  id: documentSnapshots.id,
  documentId: documentSnapshots.documentId,
  projectId: documentSnapshots.projectId,
  userId: documentSnapshots.userId,
  name: documentSnapshots.name,
  description: documentSnapshots.description,
  wordCount: documentSnapshots.wordCount,
  metadata: documentSnapshots.metadata,
  createdAt: documentSnapshots.createdAt,
};

class DocumentSnapshotService {
  /**
   * Find snapshot by ID
   */
  async findById(db: DatabaseInstance, id: string): Promise<DocumentSnapshot | undefined> {
    const result = await db
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.id, id))
      .limit(1);
    return result[0];
  }

  /**
   * List snapshots for a project without their payloads (for the snapshots
   * dialog). Use findById to fetch one snapshot's content.
   */
  async findByProjectId(
    db: DatabaseInstance,
    projectId: string
  ): Promise<DocumentSnapshotSummary[]> {
    return (db as D1DatabaseInstance)
      .select(SUMMARY_COLUMNS)
      .from(documentSnapshots)
      .where(eq(documentSnapshots.projectId, projectId))
      .orderBy(desc(documentSnapshots.createdAt));
  }

  /**
   * List snapshots for a specific document in a project, without payloads.
   */
  async findByDocumentId(
    db: DatabaseInstance,
    projectId: string,
    documentId: string
  ): Promise<DocumentSnapshotSummary[]> {
    return (db as D1DatabaseInstance)
      .select(SUMMARY_COLUMNS)
      .from(documentSnapshots)
      .where(
        and(
          eq(documentSnapshots.projectId, projectId),
          eq(documentSnapshots.documentId, documentId)
        )
      )
      .orderBy(desc(documentSnapshots.createdAt));
  }

  /**
   * Create a new document snapshot
   */
  async create(
    db: DatabaseInstance,
    data: {
      documentId: string;
      projectId: string;
      userId: string;
      name: string;
      description?: string;
      xmlContent?: string;
      worldbuildingData?: Record<string, unknown>;
      wordCount?: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Metadata can contain arbitrary JSON
      metadata?: Record<string, any>;
    }
  ): Promise<DocumentSnapshot> {
    const id = crypto.randomUUID();
    const newSnapshot: InsertDocumentSnapshot = {
      id,
      documentId: data.documentId,
      projectId: data.projectId,
      userId: data.userId,
      name: data.name,
      description: data.description || null,
      xmlContent: data.xmlContent || null,
      worldbuildingData: data.worldbuildingData || null,
      wordCount: data.wordCount || null,
      metadata: data.metadata || null,
      createdAt: Date.now(),
    };

    await db.insert(documentSnapshots).values(newSnapshot);

    const created = await this.findById(db, id);
    if (created === undefined) {
      throw new Error('Failed to create document snapshot');
    }
    return created;
  }

  /**
   * Delete a snapshot
   */
  async delete(db: DatabaseInstance, id: string): Promise<void> {
    await db.delete(documentSnapshots).where(eq(documentSnapshots.id, id));
  }
}

export const documentSnapshotService = new DocumentSnapshotService();
