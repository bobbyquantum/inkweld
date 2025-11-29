/**
 * Simple script to generate OpenAPI spec without starting the server
 *
 * NOTE: This script uses the OpenAPIHono.getOpenAPIDocument() method from @hono/zod-openapi
 * instead of the deprecated hono-openapi package.
 *
 * For full OpenAPI generation with all routes, use: bun run generate:openapi
 * which starts the server and fetches the complete spec.
 */
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';

// Import route modules
import authRoutes from '../src/routes/auth.routes';
import userRoutes from '../src/routes/user.routes';
import projectRoutes from '../src/routes/project.routes';
import snapshotRoutes from '../src/routes/snapshot.routes';
import imageRoutes from '../src/routes/image.routes';
import healthRoutes from '../src/routes/health.routes';
import configRoutes from '../src/routes/config.routes';
import csrfRoutes from '../src/routes/csrf.routes';

async function generateOpenAPISpec() {
  try {
    console.log('📜 Generating OpenAPI specification...');

    // Create an OpenAPIHono app and register routes
    const app = new OpenAPIHono();

    // Register routes
    app.route('/api/v1/auth', authRoutes);
    app.route('/api/v1/users', userRoutes);
    app.route('/api/v1/projects', projectRoutes);
    app.route('/api/v1/snapshots', snapshotRoutes);
    app.route('/api/v1/images', imageRoutes);
    app.route('/api/v1/health', healthRoutes);
    app.route('/api/v1/config', configRoutes);
    app.route('/api/v1/csrf', csrfRoutes);

    // Generate the spec using the built-in method
    const spec = app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API',
      },
      servers: [
        {
          url: 'http://localhost:8333',
          description: 'Local development server',
        },
      ],
    });

    const outputPath = path.resolve(process.cwd(), 'openapi.json');
    await writeFile(outputPath, JSON.stringify(spec, null, 2));

    console.log(`✅ OpenAPI JSON generated at: ${outputPath}`);
    console.log(`   Paths: ${Object.keys(spec.paths || {}).length}`);
    console.log(`   Schemas: ${Object.keys(spec.components?.schemas || {}).length}`);
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate OpenAPI spec:', error);
    process.exit(1);
  }
}

generateOpenAPISpec();
