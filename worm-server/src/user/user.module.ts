import { Module, forwardRef } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

@Module({
  imports: [
    forwardRef(() => AuthModule),
  ],
  providers: [
    UserService,
    UserRepository
  ],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
