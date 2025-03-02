import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { UserEntity } from '../../user/user.entity.js';
import { UserSessionEntity } from '../../auth/session.entity.js';
import { ProjectEntity } from '../../project/project.entity.js';
import * as path from 'path';

/**
 * Service responsible for providing the database configuration
 * based on the environment variables.
 */
@Injectable()
export class DatabaseConfigService {
  constructor(private configService: ConfigService) {}

  /**
   * Returns TypeORM configuration based on the selected database type
   */
  createTypeOrmOptions(): TypeOrmModuleOptions {
    const dbType = this.configService.get<string>('DB_TYPE', 'postgres');

    // Common configuration for both database types
    const baseConfig: Partial<TypeOrmModuleOptions> = {
      entities: [UserEntity, UserSessionEntity, ProjectEntity],
      synchronize: this.configService.get('NODE_ENV') !== 'production',
      logging: this.configService.get('DB_LOGGING') === 'true',
    };

    // Database-specific configuration
    if (dbType === 'sqlite') {
      const dbPath = this.configService.get<string>('DB_PATH', './sqlite.db');
      const resolvedPath = path.resolve(process.cwd(), dbPath);

      return <TypeOrmModuleOptions>{
        ...baseConfig,
        type: 'sqlite',
        database: resolvedPath,
      };
    } else {
      // Default to PostgreSQL
      return <TypeOrmModuleOptions>{
        ...baseConfig,
        type: 'postgres',
        host: this.configService.get('DB_HOST', 'localhost'),
        port: this.configService.get<number>('DB_PORT', 5432),
        username: this.configService.get('DB_USERNAME', 'wormuser'),
        password: this.configService.get<string>('DB_PASSWORD', 'secret'),
        database: this.configService.get('DB_NAME', 'wormdb'),
      };
    }
  }
}
