import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  VersionColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';

@Entity('projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @VersionColumn()
  version: number;

  @Column({ nullable: false })
  slug: string;

  @Column({ nullable: false })
  title: string;

  @Column({ length: 1000, nullable: true })
  description: string;

  @ManyToOne(() => UserEntity, (user) => user.id, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'created_date' })
  createdDate: Date;

  @UpdateDateColumn({ name: 'updated_date' })
  updatedDate: Date;
}
