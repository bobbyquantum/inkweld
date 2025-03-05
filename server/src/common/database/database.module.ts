import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseConfigService } from './database.config.js';

/**
 * Module responsible for setting up database connections
 * based on environment configuration.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return new DatabaseConfigService(configService).createTypeOrmOptions();
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    DatabaseConfigService,
  ],
  exports: [
    DatabaseConfigService,
  ],
})
export class DatabaseModule {}
