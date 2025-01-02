import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function generateAngularClient() {
  const projectRoot = process.cwd();
  const openapiJsonPath = path.resolve(projectRoot, 'openapi.json');
  const outputDir = path.resolve(projectRoot, '../frontend/src/api-client');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Generate Angular client
    execSync(
      `openapi-generator-cli generate \
      -i ${openapiJsonPath} \
      -g typescript-angular \
      --enable-post-process-file \
      -o ${outputDir} \
      --additional-properties=fileNaming=kebab-case,sortParamsByRequiredFlag=true,legacyDiscriminatorBehavior=false,ensureUniqueParams=true,sortOperations=true,sortTags=true,ngVersion=19.0.3,zonejsVersion=0.15.0,ngPackagrVersion=19.0.0,serviceSuffix=Service,serviceFileSuffix=.service`,
      { stdio: 'inherit' },
    );

    console.log('Angular client generated successfully');
  } catch (error) {
    console.error('Failed to generate Angular client:', error);
    process.exit(1);
  }
}

generateAngularClient();
