import { Module } from '@nestjs/common';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { YjsGateway } from './yjs-gateway';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TypeOrmSessionStore } from '../auth/session.store';
import { UserSessionEntity } from '../auth/session.entity';

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
