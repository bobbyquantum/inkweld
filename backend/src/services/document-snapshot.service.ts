import { eq, and, desc } from 'drizzle-orm';
import { getDatabase } from '../db';
import { documentSnapshots, DocumentSnapshot, InsertDocumentSnapshot } from '../db/schema/document-snapshots';

class DocumentSnapshotService {
  /**
   * Find snapshot by ID
   */
  async findById(id: string): Promise<DocumentSnapshot | undefined> {
    const db = getDatabase();
    const result = await db.select().from(documentSnapshots).where(eq(documentSnapshots.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find all snapshots for a project
   */
  async findByProjectId(projectId: string): Promise<DocumentSnapshot[]> {
    const db = getDatabase();
    return db
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.projectId, projectId))
      .orderBy(desc(documentSnapshots.createdAt));
  }

  /**
   * Find all snapshots for a specific document in a project
   */
  async findByDocumentId(projectId: string, documentId: string): Promise<DocumentSnapshot[]> {
    const db = getDatabase();
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
  async create(data: {
    documentId: string;
    projectId: string;
    userId: string;
    name: string;
    description?: string;
    yDocState: Buffer;
    stateVector?: Buffer;
    wordCount?: number;
    metadata?: Record<string, any>;
  }): Promise<DocumentSnapshot> {
    const db = getDatabase();
    const newSnapshot: InsertDocumentSnapshot = {
      id: crypto.randomUUID(),
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
    
    const created = await this.findById(newSnapshot.id);
    if (!created) {
      throw new Error('Failed to create document snapshot');
    }
    return created;
  }

  /**
   * Delete a snapshot
   */
  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(documentSnapshots).where(eq(documentSnapshots.id, id));
  }
}

export const documentSnapshotService = new DocumentSnapshotService();
