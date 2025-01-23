import {
  Module,
  NestModule,
  MiddlewareConsumer,
  Logger,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { UserEntity } from './user/user.entity.js';
import { AuthModule } from './auth/auth.module.js';
import { UserSessionEntity } from './auth/session.entity.js';
import { PassportModule } from '@nestjs/passport';
import { ProjectModule } from './project/project.module.js';
import { ProjectEntity } from './project/project.entity.js';
import { ProjectElementModule } from './project/element/project-element.module.js';
import { WsModule } from './ws/ws.module.js';
import { McpModule } from './mcp/mcp.module.js';
import * as path from 'path';
import { AppController } from './app.controller.js';

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
            rootPath: path.resolve(process.cwd(), '../frontend/dist/browser'),
            serveRoot: '/',
            renderPath: '/',
            serveStaticOptions: {
              index: 'index.html',
              fallthrough: true,
              preCompressed: false,
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
  controllers: [AppController],
})
export class AppModule implements NestModule {
  private readonly logger = new Logger(AppModule.name);

  configure(_consumer: MiddlewareConsumer) {
  }
}
