import { Module, forwardRef, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { UserService } from '../user/user.service.js';
import { ConfigModule } from '@nestjs/config';
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
import { CsrfController } from './csrf/csrf.controller.js';
import { CsrfMiddleware } from './csrf/csrf.middleware.js';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UserModule),
    PassportModule,
    TypeOrmModule.forFeature([UserEntity, UserSessionEntity]),
  ],
  controllers: [AuthController, CsrfController],
  providers: [
    AuthService,
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
      provide: TypeOrmSessionStore,
      useFactory: (sessionRepository) => {
        return new TypeOrmSessionStore(sessionRepository);
      },
      inject: [getRepositoryToken(UserSessionEntity)],
    },
  ],
  exports: [AuthService, TypeOrmSessionStore],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply the CSRF middleware to all routes
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
