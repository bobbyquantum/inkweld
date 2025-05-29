import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { LintController } from './lint.controller.js';
import { OpenAiService } from './services/openai.service.js';
import { DiffService } from './services/diff.service.js';
import { ConfigModule } from '@nestjs/config';
import * as express from 'express';

@Module({
  imports: [
    ConfigModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 10,
      },
    ]),
  ],
  controllers: [LintController],
  providers: [OpenAiService, DiffService],
  exports: [OpenAiService, DiffService],
})
export class LintModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply body size limit middleware to the lint controller
    consumer.apply(express.json({ limit: '4kb' })).forRoutes(LintController);
  }
}
