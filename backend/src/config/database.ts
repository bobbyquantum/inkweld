import { DataSource } from 'typeorm';
import { config } from './env';
import { User } from '../entities/user.entity';
import { UserSession } from '../entities/session.entity';
import { Project } from '../entities/project.entity';
import { DocumentSnapshot } from '../entities/document-snapshot.entity';
import * as fs from 'fs/promises';
import * as path from 'path';

let dataSource: DataSource | null = null;

export async function setupDatabase(testMode = false): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  try {
    // Ensure data directory exists (for SQLite and file storage)
    if (!testMode) {
      const dataDir = path.dirname(config.dataPath);
      await fs.mkdir(dataDir, { recursive: true }).catch(() => {});
      await fs.mkdir(config.dataPath, { recursive: true }).catch(() => {});
    }

    const dbConfig = config.database;

    // Use in-memory SQLite for tests
    const database = testMode
      ? ':memory:'
      : dbConfig.type === 'sqlite'
        ? process.env.DB_PATH || './data/inkweld.db'
        : dbConfig.database;

    dataSource = new DataSource({
      type: testMode ? 'sqlite' : dbConfig.type,
      host: !testMode && dbConfig.type === 'postgres' ? dbConfig.host : undefined,
      port: !testMode && dbConfig.type === 'postgres' ? dbConfig.port : undefined,
      username: !testMode && dbConfig.type === 'postgres' ? dbConfig.username : undefined,
      password: !testMode && dbConfig.type === 'postgres' ? dbConfig.password : undefined,
      database,
      entities: [User, UserSession, Project, DocumentSnapshot],
      synchronize: testMode || dbConfig.synchronize || config.nodeEnv === 'test',
      logging: !testMode && config.nodeEnv === 'development',
    });

    await dataSource.initialize();
    console.log(`Database connected: ${testMode ? 'sqlite (test)' : dbConfig.type}`);

    return dataSource;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Database setup error:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
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
