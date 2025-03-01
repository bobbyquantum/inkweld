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
import { UserService } from 'user/user.service.js';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
  ],
  controllers: [AuthController, OAuth2Controller],
  providers: [
    AuthService,
    LocalStrategy,
    {
      provide: GithubStrategy,
      useFactory: (userService: UserService) => {
        if (process.env.GITHUB_ENABLED && process.env.GITHUB_ENABLED === 'true') {
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
  exports: [AuthService, SessionStore],
})
export class AuthModule {}
