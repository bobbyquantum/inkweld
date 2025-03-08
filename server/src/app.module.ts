import {
  Module,
  NestModule,
  Logger,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AuthModule } from './auth/auth.module.js';
import { PassportModule } from '@nestjs/passport';
import { ProjectModule } from './project/project.module.js';
import { ProjectElementModule } from './project/element/project-element.module.js';
import { WsModule } from './ws/ws.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { LevelDBManagerService } from './common/persistence/leveldb-manager.service.js';
import * as path from 'path';
import { DatabaseModule } from './common/database/database.module.js';
import { cwd } from 'process';

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
      useFactory: () => {
        return [
          {
            rootPath: path.resolve(path.join(cwd(),'../frontend/dist/browser')),
            serveStaticOptions: {
                preCompressed: true,
            }
          },
        ];
      },
      inject: [ConfigService],
    }),
    DatabaseModule,
    PassportModule.register({ session: true }),
    ProjectModule,
    ProjectElementModule,
    AuthModule,
    WsModule,
    McpModule,
  ],
  providers: [
    LevelDBManagerService
  ],
  exports: [
    LevelDBManagerService
  ],
  controllers: [],
})
export class AppModule implements NestModule {
  private readonly logger = new Logger(AppModule.name);

  configure() {}
}
