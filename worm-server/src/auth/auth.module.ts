import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { GithubStrategy } from './github.strategy.js';
import { AuthController } from './auth.controller.js';
import { OAuth2Controller } from './oauth2.controller.js';
import { SessionStore } from './session.store.js';
import { LevelDBManagerService } from '../common/persistence/leveldb-manager.service.js';
import { UserService } from './user.service.js';
import { PersistenceModule } from '../common/persistence/persistence.module.js';
import { UserController } from './user.controller.js';
import { UserRepository } from './user.repository.js';

@Module({
  imports: [ConfigModule, PassportModule, PersistenceModule],
  controllers: [AuthController, OAuth2Controller, UserController],
  providers: [
    AuthService,
    UserService,
    UserRepository,
    LocalStrategy,
    {
      provide: GithubStrategy,
      useFactory: (userService: UserService) => {
        if (
          process.env.GITHUB_ENABLED &&
          process.env.GITHUB_ENABLED === 'true'
        ) {
          return new GithubStrategy(userService);
        }
        return null;
      },
      inject: [UserService],
    },
    {
      provide: SessionStore,
      useFactory: (levelDBManager: LevelDBManagerService) => {
        return new SessionStore(levelDBManager);
      },
      inject: [LevelDBManagerService],
    },
  ],
  exports: [AuthService, SessionStore, UserRepository, UserService],
})
export class AuthModule {}
