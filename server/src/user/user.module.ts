import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './user.entity.js';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { UserSessionEntity } from '../auth/session.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { StorageModule } from '../common/storage/storage.module.js';
import { SystemConfigModule } from '../config/config.module.js';

@Module({
  imports: [
    StorageModule.register(),
    TypeOrmModule.forFeature([UserEntity, UserSessionEntity]),
    forwardRef(() => AuthModule),
    SystemConfigModule,
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
