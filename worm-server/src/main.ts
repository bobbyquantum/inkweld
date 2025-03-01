import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import * as path from 'path';
import session from 'express-session';
import { LevelDBSessionStore } from './auth/session.store.leveldb.js';
import { WsAdapter } from '@nestjs/platform-ws';
import { INestApplication } from '@nestjs/common';
import { ValidationFilter } from './common/filters/validation.filter.js';
// import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// import compression from '@fastify/compress';

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
  // const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const app = await NestFactory.create(AppModule);
  // await app.register(compression)
  // Enable CORS with multiple origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept, Authorization, x-xsrf-token',
    credentials: true, // Important for session cookies
  });

  // Configure session middleware
  const sessionStore = app.get(LevelDBSessionStore);
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

  app.useGlobalFilters(new ValidationFilter());

  await setupSwagger(app);
  await app.listen(process.env.PORT ?? 8333, '0.0.0.0');
}
bootstrap();
