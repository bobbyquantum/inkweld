import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinColumn
} from 'typeorm';
import { UserEntity } from '../../user/user.entity.js';
import {
  TemplateSchemaDto,
  TemplateLayoutDto,
  TemplateMetadataDto
} from './template.dto.js';

@Entity()
@Index(['name', 'createdBy'], { unique: true })
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  name!: string;

  @Column({ nullable: true, type: 'text' })
  description?: string;

  @Column({ type: 'jsonb' })
  schema!: TemplateSchemaDto;

  @Column({ type: 'jsonb' })
  layout!: TemplateLayoutDto;

  @Column({ type: 'jsonb' })
  metadata!: TemplateMetadataDto;

  @Column({ type: 'int' })
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column()
  createdBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  creator!: UserEntity;

  @Column({ default: false })
  @Index()
  isPublic!: boolean;

  @Column('text', { array: true, nullable: true })
  tags?: string[];

  @Column({ nullable: true })
  @Index()
  category?: string;

  @Column({ nullable: true })
  @Index()
  parentTemplateId?: string;

  @ManyToOne(() => Template, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentTemplateId' })
  parentTemplate?: Template;
}
