// project-element.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  VersionColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ElementType } from './element-type.enum';
import { ProjectEntity } from '../project.entity';

@Entity('project_elements')
export class ProjectElementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @VersionColumn()
  version: number;

  @Column({ nullable: false })
  name: string;

  @Column({
    type: 'enum',
    enum: ElementType,
    nullable: false,
  })
  type: ElementType;

  @Column({ nullable: false })
  position: number;

  @Column({ nullable: false })
  level: number;

  // Relationship to Project
  @ManyToOne(() => ProjectEntity, (project) => project.id, {
    eager: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: ProjectEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'content', type: 'jsonb', nullable: true })
  content: any; // or string, depending on your usage

  @Column({ type: 'bytea', nullable: true })
  value: Buffer;
}
