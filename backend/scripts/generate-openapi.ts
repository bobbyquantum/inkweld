/**
 * Script to generate OpenAPI specification from Hono routes
 *
 * This script:
 * 1. Deletes old openapi.json if it exists
 * 2. Starts the server
 * 3. Waits for it to be ready
 * 4. Fetches the OpenAPI spec
 * 5. Converts Express-style path parameters to OpenAPI-style
 * 6. Stops the server
 * 7. Saves the spec to openapi.json
 *
 * Run with: bun run generate:openapi
 */

import { writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';

/**
 * Convert Express-style path parameters (:param) to OpenAPI-style ({param})
 * Hono uses Express-style paths internally, but OpenAPI spec requires {param} format
 * Also normalizes paths by removing double slashes
 */
function convertPathParameters(spec: Record<string, unknown>): Record<string, unknown> {
  if (!spec.paths || typeof spec.paths !== 'object') {
    return spec;
  }

  const paths = spec.paths as Record<string, unknown>;
  const convertedPaths: Record<string, unknown> = {};

  for (const [pathKey, pathValue] of Object.entries(paths)) {
    // Convert :paramName to {paramName}
    let convertedPath = pathKey.replaceAll(/:([a-zA-Z_]\w*)/g, '{$1}');
    // Normalize double slashes (e.g., //oauth/authorize -> /oauth/authorize)
    convertedPath = convertedPath.replaceAll(/\/+/g, '/');
    convertedPaths[convertedPath] = pathValue;
  }

  return {
    ...spec,
    paths: convertedPaths,
  };
}

/**
 * Ensure securitySchemes is properly added to components
 * The Hono OpenAPI plugin doesn't always merge components correctly
 */
function ensureSecuritySchemes(spec: Record<string, unknown>): Record<string, unknown> {
  const components = (spec.components || {}) as Record<string, unknown>;

  // Add securitySchemes if not present
  if (!components.securitySchemes) {
    components.securitySchemes = {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT token obtained from POST /api/v1/auth/login. Include as: Authorization: Bearer <token>',
      },
    };
  }

  return {
    ...spec,
    components,
  };
}

let serverProcess: ChildProcess | null = null;
let exitCode = 0;

try {
  // Delete old openapi.json if it exists
  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  try {
    await unlink(outputPath);
    console.log('🗑️  Deleted old openapi.json');
  } catch {
    // File doesn't exist, that's fine
  }

  console.log('🚀 Starting server...');

  // Start the server process
  serverProcess = spawn('bun', ['src/bun-runner.ts'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;

  // Listen for server output to know when it's ready
  serverProcess.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.log('STDOUT:', output);
    if (
      output.includes('ready on port') ||
      output.includes('Server listening on') ||
      output.includes('Inkweld backend ready')
    ) {
      serverReady = true;
    }
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    const output = data.toString();
    console.log('STDERR:', output);
    if (
      output.includes('ready on port') ||
      output.includes('Server listening on') ||
      output.includes('Inkweld backend ready')
    ) {
      serverReady = true;
    }
  });

  // Wait for server to be ready (max 30 seconds)
  const startTime = Date.now();
  while (!serverReady && Date.now() - startTime < 30000) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Also try to connect to check if server is ready
    try {
      const testResponse = await fetch('http://localhost:8333/api/v1/health');
      if (testResponse.ok) {
        serverReady = true;
        break;
      }
    } catch {
      // Server not ready yet, continue waiting
    }
  }

  if (!serverReady) {
    throw new Error('Server failed to start within 30 seconds');
  }

  console.log('✅ Server started');
  console.log('⏳ Fetching OpenAPI specification...');

  // Give it one more second to be fully ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Fetch the OpenAPI spec from the doc endpoint
  const response = await fetch('http://localhost:8333/api/openapi.json');

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
  }

  const rawSpec = (await response.json()) as Record<string, unknown>;

  // Convert Express-style path parameters to OpenAPI-style
  let spec = convertPathParameters(rawSpec);

  // Ensure securitySchemes is properly added
  spec = ensureSecuritySchemes(spec);

  // Write to the same path we cleaned up earlier
  await writeFile(outputPath, JSON.stringify(spec, null, 2));

  const paths = spec.paths as Record<string, unknown> | undefined;
  const components = spec.components as Record<string, Record<string, unknown>> | undefined;
  console.log(`✅ OpenAPI JSON generated at: ${outputPath}`);
  console.log(`   Paths: ${Object.keys(paths || {}).length}`);
  console.log(`   Schemas: ${Object.keys(components?.schemas || {}).length}`);
  console.log('');
} catch (error) {
  console.error('❌ Failed to generate OpenAPI spec:', error);
  exitCode = 1;
} finally {
  // Always stop the server
  if (serverProcess) {
    console.log('🛑 Stopping server...');
    serverProcess.kill('SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Force kill if still running
    try {
      serverProcess.kill('SIGKILL');
    } catch {
      // Already dead, that's fine
    }
  }

  if (exitCode === 0) {
    console.log('✅ Done!');
  } else {
    console.error(`❌ Failed with exit code ${exitCode}`);
  }
  process.exit(exitCode);
}
