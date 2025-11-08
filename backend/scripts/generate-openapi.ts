/**
 * Script to generate OpenAPI specification from Hono routes
 *
 * This script:
 * 1. Starts the server
 * 2. Waits for it to be ready
 * 3. Fetches the OpenAPI spec
 * 4. Stops the server
 * 5. Saves the spec to openapi.json
 *
 * Run with: bun run generate:openapi
 */

import { writeFile } from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

async function generateOpenAPIJson() {
  let serverProcess: any = null;

  try {
    console.log('🚀 Starting server...');

    // Start the server process
    serverProcess = spawn('bun', ['src/index.ts'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let serverReady = false;

    // Listen for server output to know when it's ready
    serverProcess.stdout.on('data', (data: Buffer) => {
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

    serverProcess.stderr.on('data', (data: Buffer) => {
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
        const testResponse = await fetch('http://localhost:8333/api/health');
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

    const spec = await response.json();

    const outputPath = path.resolve(process.cwd(), 'openapi.json');
    await writeFile(outputPath, JSON.stringify(spec, null, 2));

    console.log(`✅ OpenAPI JSON generated at: ${outputPath}`);
    console.log(`   Paths: ${Object.keys(spec.paths || {}).length}`);
    console.log(`   Schemas: ${Object.keys(spec.components?.schemas || {}).length}`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to generate OpenAPI spec:', error);
    process.exit(1);
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

    console.log('✅ Done!');
    process.exit(0);
  }
}

generateOpenAPIJson();
