import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { UserModule } from '../user/user.module';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { GithubStrategy } from './github.strategy';
import { AuthController } from './auth.controller';
import { UserEntity } from '../user/user.entity';
import { UserSessionEntity } from './session.entity';
import { TypeOrmSessionStore } from './session.store';
import { OAuth2Controller } from './oauth2.controller';

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
