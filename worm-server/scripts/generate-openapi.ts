import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { AppModule } from '../src/app.module.js';
import { createOpenAPIConfig } from '../src/main.js';

async function generateOpenAPIJson() {
  const app = await NestFactory.create(AppModule, { preview: true });
  const config = createOpenAPIConfig();
  const document = SwaggerModule.createDocument(app, config);

  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  await writeFile(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI JSON generated at: ${outputPath}`);
  await app.close();
}

generateOpenAPIJson().catch(console.error);
