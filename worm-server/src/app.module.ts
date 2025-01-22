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
import { UserEntity } from './user/user.entity.js';
import { AuthModule } from './auth/auth.module.js';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { UserSessionEntity } from './auth/session.entity.js';
import { PassportModule } from '@nestjs/passport';
import { ProjectModule } from './project/project.module.js';
import { ProjectEntity } from './project/project.entity.js';
import { ProjectElementModule } from './project/element/project-element.module.js';
import { WsModule } from './ws/ws.module.js';
import { McpModule } from './mcp/mcp.module.js';
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
          return [];
        }
        return [
          {
            rootPath: path.resolve('frontend/dist/worm-frontend/browser'),
            serveRoot: '/',
            serveStaticOptions: {
              index: 'index.html',
              fallthrough: false,
              decorateReply: true
            },
          },
        ];
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'wormuser'),
        password: configService.get('DB_PASSWORD', 'secret'),
        database: configService.get('DB_NAME', 'wormdb'),
        entities: [UserEntity, UserSessionEntity, ProjectEntity],
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
      inject: [ConfigService],
    }),
    PassportModule.register({ session: true }),
    ProjectModule,
    ProjectElementModule,
    AuthModule,
    WsModule,
    McpModule,
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  private readonly logger = new Logger(AppModule.name);

  configure(consumer: MiddlewareConsumer) {
    const configService = new ConfigService();
    const isDev = configService.get('NODE_ENV') !== 'production';

    if (isDev) {
      consumer
        .apply(
          createProxyMiddleware({
            target: 'http://localhost:4200',
            changeOrigin: true,
            ws: true,
          }),
        )
        .exclude({ path: 'api/*path', method: RequestMethod.ALL })
        .exclude({ path: 'login/*path', method: RequestMethod.ALL })
        .exclude({ path: 'oauth2/*path', method: RequestMethod.ALL })
        .exclude({ path: 'mcp/*path', method: RequestMethod.ALL })
        .exclude({ path: 'ws/yjs/*path', method: RequestMethod.ALL })
        .forRoutes({ path: '*', method: RequestMethod.ALL });
    }
  }
}
