import { Module } from '@nestjs/common';
import { YjsGateway } from './yjs-gateway.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
  ],
  providers: [YjsGateway, LevelDBManagerService],
  exports: [YjsGateway],
})
export class WsModule {}
