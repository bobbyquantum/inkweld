import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as session from 'express-session';
import { TypeOrmSessionStore } from './auth/session.store';
import { WsAdapter } from '@nestjs/platform-ws';
import { ExpressAdapter } from '@nestjs/platform-express';
import { INestApplication } from '@nestjs/common';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export function createOpenAPIConfig() {
  return new DocumentBuilder()
    .setTitle('Worm API')
    .setDescription(
      'Worm tunnel protocol - Secure API for managing projects and user data',
    )
    .setVersion(process.env.WORM_VERSION || '1.0')
    .addTag(
      'User API',
      'The user controller allows accessing and updating details for the current user.',
    )
    .addTag(
      'Project API',
      'The project controller supports various functions relating to projects.',
    )
    .build();
}

export async function setupSwagger(app: INestApplication) {
  const config = createOpenAPIConfig();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  return document;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());

  // Enable CORS for Angular frontend
  app.enableCors({
    origin: 'http://localhost:4200',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization',
    credentials: true, // Important for session cookies
  });

  // Configure session middleware
  const sessionStore = app.get(TypeOrmSessionStore);
  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'fallback-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax', // Recommended for session cookies
      },
    }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));

  await setupSwagger(app);
  await app.listen(process.env.PORT ?? 8333);
}
bootstrap();
