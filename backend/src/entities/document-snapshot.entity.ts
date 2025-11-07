import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from './user.entity';

@Entity('document_snapshots')
export class DocumentSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'document_id', length: 500 })
  documentId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'y_doc_state', type: 'blob' })
  yDocState: Buffer;

  @Column({ name: 'state_vector', type: 'blob', nullable: true })
  stateVector?: Buffer;

  @Column({ name: 'word_count', nullable: true })
  wordCount?: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
