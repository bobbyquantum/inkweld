/**
 * Global setup for Wrangler e2e tests
 *
 * Initializes the local D1 database before running tests.
 */
import { execSync } from 'child_process';
import { join } from 'path';

async function globalSetup() {
  console.log('🗃️  Initializing D1 database for Wrangler e2e tests...');

  const backendDir = join(__dirname, '../../backend');

  try {
    execSync('bun run init:d1-local', {
      cwd: backendDir,
      stdio: 'inherit',
    });
    console.log('✅ D1 database initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize D1 database:', error);
    throw error;
  }
}

export default globalSetup;
