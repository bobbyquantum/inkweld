import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YjsGateway } from './yjs-gateway.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { UserSessionEntity } from '../auth/session.entity.js';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TypeOrmModule.forFeature([UserSessionEntity]),
  ],
  providers: [YjsGateway],
  exports: [YjsGateway],
})
export class WsModule {}
