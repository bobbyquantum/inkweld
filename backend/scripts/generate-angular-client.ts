/**
 * Script to generate Angular client from OpenAPI specification
 *
 * This script:
 * 1. Reads the openapi.json file
 * 2. Generates TypeScript Angular client code
 * 3. Formats it with the frontend's prettier config
 * 4. Outputs to frontend/src/api-client directory
 *
 * Prerequisites:
 * - openapi.json must exist (run `bun run generate:openapi` first)
 * - @openapitools/openapi-generator-cli must be installed
 * - a Java runtime must be available (the generator is a JVM tool)
 *
 * Run with: bun run generate:angular-client
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function generateAngularClient() {
  const projectRoot = process.cwd();
  const openapiJsonPath = path.resolve(projectRoot, 'openapi.json');
  const outputDir = path.resolve(projectRoot, '../frontend/src/api-client');
  const frontendDir = path.resolve(projectRoot, '../frontend');

  // Check if openapi.json exists
  if (!fs.existsSync(openapiJsonPath)) {
    console.error('❌ openapi.json not found!');
    console.error('   Run `bun run generate:openapi` first to generate the OpenAPI specification.');
    process.exit(1);
  }

  // Clean old client directory to avoid leftover files
  if (fs.existsSync(outputDir)) {
    console.log('🗑️  Cleaning old API client...');
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    console.log('🚀 Generating Angular client from OpenAPI spec...');
    console.log(`   Input: ${openapiJsonPath}`);
    console.log(`   Output: ${outputDir}`);
    console.log(`   Config: openapitools.json`);
    console.log('');

    // Generate Angular client using config from openapitools.json
    // Use the generator config named 'angular-client' from openapitools.json
    execSync('npx @openapitools/openapi-generator-cli generate --generator-key angular-client', {
      stdio: 'inherit',
    });

    // The generator emits its own formatting (4-space indent, trailing spaces)
    // while the repository commits prettier-formatted output. Formatting here
    // keeps every regeneration to just the real API changes — without it the
    // diff is a whole-client reformat (~40k lines), which buries the actual
    // change and makes the CI freshness check fail on an otherwise clean tree.
    console.log('');
    console.log('🎨 Formatting generated client with prettier...');
    execSync('npx --no-install prettier --write "src/api-client/**/*.ts"', {
      cwd: frontendDir,
      stdio: 'inherit',
    });

    console.log('');
    console.log('✅ Angular client generated successfully!');
  } catch (error) {
    console.error('❌ Failed to generate Angular client:', error);
    process.exit(1);
  }
}

generateAngularClient();
