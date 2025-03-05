import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YjsGateway } from './yjs-gateway.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { UserSessionEntity } from '../auth/session.entity.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([UserSessionEntity]),
  ],
  providers: [YjsGateway, LevelDBManagerService],
  exports: [YjsGateway],
})
export class WsModule {}
