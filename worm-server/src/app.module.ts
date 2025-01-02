import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
  Logger,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { UserEntity } from './user/user.entity';
import { AuthModule } from './auth/auth.module';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { UserSessionEntity } from './auth/session.entity';
import { PassportModule } from '@nestjs/passport';
import { ProjectModule } from './project/project.module';
import { ProjectEntity } from './project/project.entity';
import { ProjectElementModule } from './project/element/project-element.module';
import { ProjectElementEntity } from './project/element/project-element.entity';
import { WsModule } from './ws/ws.module';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '../.env.local'),
        path.resolve(process.cwd(), '../.env'),
      ],
      cache: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'wormuser',
      password: 'secret',
      database: 'wormdb',
      entities: [
        UserEntity,
        UserSessionEntity,
        ProjectEntity,
        ProjectElementEntity,
      ],
      synchronize: true, // auto-create DB schema in dev (turn off in production!)
    }),
    PassportModule.register({ session: true }),
    UserModule,
    ProjectModule,
    ProjectElementModule,
    AuthModule,
    WsModule,
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  private readonly logger = new Logger(AppModule.name);

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        createProxyMiddleware({
          target: 'http://localhost:4200',
          changeOrigin: true,
          // logger: console,
          ws: true,
        }),
      )
      .exclude({ path: 'api/(.*)', method: RequestMethod.ALL })
      .exclude({ path: 'login/(.*)', method: RequestMethod.ALL })
      .exclude({ path: 'oauth2/(.*)', method: RequestMethod.ALL })
      .exclude({ path: 'ws/yjs/(.*)', method: RequestMethod.ALL })
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
