import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database.config.js';
import * as path from 'path';
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';

describe('DatabaseConfigService', () => {
  let service: DatabaseConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          // Use an empty object as the process.env mock
          ignoreEnvFile: true,
        }),
      ],
      providers: [DatabaseConfigService],
    }).compile();

    service = module.get<DatabaseConfigService>(DatabaseConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTypeOrmOptions', () => {
    it('should return PostgreSQL configuration by default', () => {
      spyOn(configService, 'get').mockImplementation((key: string) => {
        const defaults = {
          DB_TYPE: 'postgres',
          DB_HOST: 'localhost',
          DB_PORT: 5432,
          DB_USERNAME: 'user',
          DB_PASSWORD: 'secret',
          DB_NAME: 'db',
          NODE_ENV: 'development',
        };
        return defaults[key];
      });

      const config = service.createTypeOrmOptions();
      expect(config.type).toEqual('postgres');
      expect(config).toMatchObject({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'user',
        password: 'secret',
        database: 'db',
        synchronize: true,
      });
    });

    it('should return SQLite configuration when DB_TYPE is sqlite', () => {
      const mockDbPath = './test.db';
      spyOn(configService, 'get').mockImplementation((key: string) => {
        const defaults = {
          DB_TYPE: 'sqlite',
          DB_PATH: mockDbPath,
          NODE_ENV: 'development',
        };
        return defaults[key];
      });

      const config = service.createTypeOrmOptions();
      expect(config.type).toEqual('sqlite');
      expect(config).toMatchObject({
        type: 'sqlite',
        database: path.resolve(process.cwd(), mockDbPath),
        synchronize: true,
      });
    });
  });
});
