/**
 * Script to generate Angular client from OpenAPI specification
 *
 * This script:
 * 1. Reads the openapi.json file
 * 2. Generates TypeScript Angular client code
 * 3. Outputs to frontend/src/api-client directory
 *
 * Prerequisites:
 * - openapi.json must exist (run `bun run generate:openapi` first)
 * - @openapitools/openapi-generator-cli must be installed
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

  // Check if openapi.json exists
  if (!fs.existsSync(openapiJsonPath)) {
    console.error('❌ openapi.json not found!');
    console.error('   Run `bun run generate:openapi` first to generate the OpenAPI specification.');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🚀 Generating Angular client from OpenAPI spec...');
    console.log(`   Input: ${openapiJsonPath}`);
    console.log(`   Output: ${outputDir}`);
    console.log('');

    // Convert Windows paths to forward slashes for the generator
    const inputPath = openapiJsonPath.replace(/\\/g, '/');
    const outputPath = outputDir.replace(/\\/g, '/');

    // Generate Angular client using the same settings as /server
    execSync(
      `npx @openapitools/openapi-generator-cli generate -i ${inputPath} -g typescript-angular --enable-post-process-file -o ${outputPath} --additional-properties=fileNaming=kebab-case,sortParamsByRequiredFlag=true,legacyDiscriminatorBehavior=false,ensureUniqueParams=true,sortOperations=true,sortTags=true,ngVersion=20.0.0,zonejsVersion=0.15.0,ngPackagrVersion=20.0.0,serviceSuffix=Service,serviceFileSuffix=.service`,
      { stdio: 'inherit' }
    );

    console.log('');
    console.log('✅ Angular client generated successfully!');
  } catch (error) {
    console.error('❌ Failed to generate Angular client:', error);
    process.exit(1);
  }
}

generateAngularClient();
