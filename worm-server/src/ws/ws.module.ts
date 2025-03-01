import { Module } from '@nestjs/common';
import { YjsGateway } from './yjs-gateway.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { PersistenceModule } from '../common/persistence/persistence.module.js';

@Module({
  imports: [ConfigModule, AuthModule, PersistenceModule],
  providers: [YjsGateway],
  exports: [YjsGateway],
})
export class WsModule {}
