/**
 * Simple script to generate OpenAPI spec without starting the server
 * This avoids database connection issues
 */
import { writeFile } from 'fs/promises';
import * as path from 'path';

// Import schemas to ensure they're loaded
import '../src/schemas';

// Create a mock app with just the OpenAPI endpoint
async function generateOpenAPISpec() {
  try {
    console.log('📜 Generating OpenAPI specification...');

    // Import generateSpecs
    const { generateSpecs } = await import('hono-openapi');
    const { Hono } = await import('hono');

    // Create a minimal app
    const app = new Hono();

    // Import route definitions (they won't execute, just register schemas)
    await import('../src/routes/auth.routes');
    await import('../src/routes/user.routes');
    await import('../src/routes/project.routes');
    await import('../src/routes/snapshot.routes');
    await import('../src/routes/image.routes');
    await import('../src/routes/health.routes');
    await import('../src/routes/config.routes');
    await import('../src/routes/csrf.routes');

    // Generate the spec
    const spec = await generateSpecs(app, {
      documentation: {
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
      },
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
