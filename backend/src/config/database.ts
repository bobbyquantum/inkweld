import { DataSource } from 'typeorm';
import { config } from './env';
import { User } from '../entities/user.entity';
import { UserSession } from '../entities/session.entity';
import { Project } from '../entities/project.entity';

let dataSource: DataSource | null = null;

export async function setupDatabase(): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  const dbConfig = config.database;

  dataSource = new DataSource({
    type: dbConfig.type,
    host: dbConfig.type === 'postgres' ? dbConfig.host : undefined,
    port: dbConfig.type === 'postgres' ? dbConfig.port : undefined,
    username: dbConfig.type === 'postgres' ? dbConfig.username : undefined,
    password: dbConfig.type === 'postgres' ? dbConfig.password : undefined,
    database: dbConfig.type === 'sqlite' ? './data/inkweld.db' : dbConfig.database,
    entities: [User, UserSession, Project],
    synchronize: dbConfig.synchronize,
    logging: config.nodeEnv === 'development',
  });

  await dataSource.initialize();
  console.log(`Database connected: ${dbConfig.type}`);

  return dataSource;
}

export function getDataSource(): DataSource {
  if (!dataSource?.isInitialized) {
    throw new Error('Database not initialized. Call setupDatabase() first.');
  }
  return dataSource;
}

export async function closeDatabase(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
  }
}
