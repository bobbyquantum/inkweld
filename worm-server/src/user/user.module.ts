import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { UserSessionEntity } from '../auth/session.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserSessionEntity])],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
