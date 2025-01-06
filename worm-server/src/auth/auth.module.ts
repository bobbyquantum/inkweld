import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module.js';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { GithubStrategy } from './github.strategy.js';
import { AuthController } from './auth.controller.js';
import { UserEntity } from '../user/user.entity.js';
import { UserSessionEntity } from './session.entity.js';
import { TypeOrmSessionStore } from './session.store.js';
import { OAuth2Controller } from './oauth2.controller.js';

@Module({
  imports: [
    UserModule,
    PassportModule,
    TypeOrmModule.forFeature([UserEntity, UserSessionEntity]),
  ],
  controllers: [AuthController, OAuth2Controller],
  providers: [
    AuthService,
    LocalStrategy,
    GithubStrategy,
    {
      provide: TypeOrmSessionStore,
      useFactory: (sessionRepository) => {
        return new TypeOrmSessionStore(sessionRepository);
      },
      inject: [getRepositoryToken(UserSessionEntity)],
    },
  ],
  exports: [AuthService, TypeOrmSessionStore],
})
export class AuthModule {}
