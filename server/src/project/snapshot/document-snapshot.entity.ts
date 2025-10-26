import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ProjectEntity } from '../project.entity.js';
import { UserEntity } from '../../user/user.entity.js';

/**
 * Entity representing a document snapshot
 * Stores the complete Yjs document state at a specific point in time
 */
@Entity('document_snapshots')
export class DocumentSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The Yjs document ID (format: username:projectSlug:docName)
   */
  @Column({ name: 'document_id', length: 500 })
  documentId: string;

  /**
   * The project this snapshot belongs to
   */
  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  /**
   * The user who created this snapshot
   */
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /**
   * User-provided name for the snapshot
   */
  @Column({ length: 255 })
  name: string;

  /**
   * Optional description of the snapshot
   */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Complete Yjs document state encoded as binary
   * This is the result of Y.encodeStateAsUpdate(ydoc)
   * Uses 'bytea' for PostgreSQL, 'blob' for SQLite
   */
  @Column({ name: 'y_doc_state', type: 'blob' })
  yDocState: Buffer;

  /**
   * Yjs state vector at the time of snapshot
   * Used for future diffing and comparison features
   * This is the result of Y.encodeStateVector(ydoc)
   * Uses 'bytea' for PostgreSQL, 'blob' for SQLite
   */
  @Column({ name: 'state_vector', type: 'blob', nullable: true })
  stateVector?: Buffer;

  /**
   * Cached word count for display purposes
   */
  @Column({ name: 'word_count', nullable: true })
  wordCount?: number;

  /**
   * Extensible metadata for future features
   * Can store things like:
   * - document title at snapshot time
   * - character count
   * - schema version
   * - automatic vs manual snapshot
   * Uses 'jsonb' for PostgreSQL, 'simple-json' for SQLite
   */
  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  /**
   * When the snapshot was created
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
