import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_sessions')
export class UserSession {
  @PrimaryColumn('varchar')
  id: string;

  @Column('json', { nullable: true })
  data: Record<string, unknown>;

  @Column('bigint')
  expiredAt: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
