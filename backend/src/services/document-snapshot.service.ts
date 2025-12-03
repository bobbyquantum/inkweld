import { eq, and, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  documentSnapshots,
  DocumentSnapshot,
  InsertDocumentSnapshot,
} from '../db/schema/document-snapshots';

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
   * Find all snapshots for a project
   */
  async findByProjectId(db: DatabaseInstance, projectId: string): Promise<DocumentSnapshot[]> {
    return db
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.projectId, projectId))
      .orderBy(desc(documentSnapshots.createdAt));
  }

  /**
   * Find all snapshots for a specific document in a project
   */
  async findByDocumentId(
    db: DatabaseInstance,
    projectId: string,
    documentId: string
  ): Promise<DocumentSnapshot[]> {
    return db
      .select()
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
      yDocState: Buffer;
      stateVector?: Buffer;
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
      yDocState: data.yDocState,
      stateVector: data.stateVector || null,
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
