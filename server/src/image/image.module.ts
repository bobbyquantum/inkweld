import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { ImageController } from './image.controller.js';
import { OpenAiImageService } from './services/openai.service.js';
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
  controllers: [ImageController],
  providers: [OpenAiImageService],
  exports: [OpenAiImageService],
})
export class ImageModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply larger body size limit for the image controller since base64 images can be large
    consumer.apply(express.json({ limit: '8mb' })).forRoutes(ImageController);
  }
}
