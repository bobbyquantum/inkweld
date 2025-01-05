import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
  Logger,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
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
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isDev = configService.get('NODE_ENV') !== 'production';
        if (isDev) {
          return []; // Don't serve static files in dev mode
        }
        return [
          {
            rootPath: '../frontend/dist/worm-frontend',
            exclude: ['/api*', '/login*', '/oauth2*', '/ws*'],
            serveRoot: '/',
            serveStaticOptions: {
              fallthrough: true, // Allow falling through to other middleware
            },
          },
        ];
      },
      inject: [ConfigService],
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
    const configService = new ConfigService();
    const isDev = configService.get('NODE_ENV') !== 'production';

    if (isDev) {
      // Development mode: proxy to Angular dev server
      consumer
        .apply(
          createProxyMiddleware({
            target: 'http://localhost:4200',
            changeOrigin: true,
            ws: true,
          }),
        )
        .exclude({ path: 'api/(.*)', method: RequestMethod.ALL })
        .exclude({ path: 'login/(.*)', method: RequestMethod.ALL })
        .exclude({ path: 'oauth2/(.*)', method: RequestMethod.ALL })
        .exclude({ path: 'ws/yjs/(.*)', method: RequestMethod.ALL })
        .forRoutes({ path: '*', method: RequestMethod.ALL });
    } else {
      // Production mode: serve index.html for client-side routing
      consumer
        .apply((req, res, next) => {
          if (
            !req.url.startsWith('/api/') &&
            !req.url.startsWith('/login/') &&
            !req.url.startsWith('/oauth2/') &&
            !req.url.startsWith('/ws/') &&
            !req.url.match(/\.(js|css|ico|png|jpg|jpeg|gif|svg|json)$/)
          ) {
            res.sendFile('../frontend/dist/worm-frontend/index.html');
          } else {
            next();
          }
        })
        .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
  }
}
