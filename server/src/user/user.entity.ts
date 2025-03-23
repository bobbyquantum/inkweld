import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true, unique: true })
  username: string | null;

  @Column({ nullable: true })
  name: string | null;

  @Column({ nullable: true })
  email: string | null;

  @Column({ nullable: true })
  password: string | null;

  @Column({ nullable: true, unique: true })
  githubId: string | null;

  @Column({ default: false })
  enabled: boolean;
}
