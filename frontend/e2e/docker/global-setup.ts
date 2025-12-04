import { execSync } from 'child_process';
import * as path from 'path';

const CONTAINER_NAME = 'inkweld-e2e-test';
const DOCKER_PORT = 8333;
const HEALTH_CHECK_URL = `http://localhost:${DOCKER_PORT}/api/v1/health`;
const HEALTH_CHECK_TIMEOUT = 180000; // 3 minutes for image build + startup
const HEALTH_CHECK_INTERVAL = 2000;

/**
 * Global setup for Docker E2E tests.
 *
 * This script:
 * 1. Builds the Docker image (if needed)
 * 2. Stops any existing test container
 * 3. Starts a fresh container with test configuration
 * 4. Waits for the health check to pass
 */
export default async function globalSetup(): Promise<void> {
  const rootDir = path.resolve(__dirname, '../../..');

  console.log('\n🐳 Docker E2E Setup');
  console.log('==================\n');

  // Stop any existing container
  console.log('🧹 Cleaning up existing container...');
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
    console.log('   Removed existing container');
  } catch {
    // Container doesn't exist, that's fine
    console.log('   No existing container to remove');
  }

  // Build the image using docker compose
  console.log('\n🔨 Building Docker image...');
  console.log('   This may take a few minutes on first run...\n');

  try {
    execSync('docker compose build inkweld-backend', {
      cwd: rootDir,
      stdio: 'inherit',
    });
    console.log('\n✅ Image built successfully\n');
  } catch (error) {
    console.error('\n❌ Docker image build failed!');
    console.error(
      '   This is the kind of error this test suite is designed to catch.'
    );
    throw error;
  }

  // Start the container with test configuration
  console.log('🚀 Starting test container...');

  const dockerArgs = [
    'run',
    '-d',
    '--name',
    CONTAINER_NAME,
    '-p',
    `${DOCKER_PORT}:8333`,
    '-e',
    'NODE_ENV=test',
    '-e',
    'DB_TYPE=sqlite',
    '-e',
    'DB_PATH=/data/sqlite.db',
    '-e',
    'SESSION_SECRET=test-session-secret-for-docker-e2e-testing-min-32-chars',
    '-e',
    'USER_APPROVAL_REQUIRED=false',
    '-e',
    'GITHUB_ENABLED=false',
    '-e',
    'LOCAL_USERS_ENABLED=true',
    // Don't restrict origins in test mode
    '-e',
    'ALLOWED_ORIGINS=*',
    'inkweld-inkweld-backend',
  ];

  try {
    execSync(`docker ${dockerArgs.join(' ')}`, {
      cwd: rootDir,
      stdio: 'pipe',
    });
    console.log(`   Container ${CONTAINER_NAME} started`);
  } catch (error) {
    console.error('❌ Failed to start container');
    // Show container logs if available
    try {
      const logs = execSync(`docker logs ${CONTAINER_NAME}`, {
        encoding: 'utf-8',
      });
      console.error('Container logs:', logs);
    } catch {
      // Ignore
    }
    throw error;
  }

  // Wait for health check
  console.log('\n⏳ Waiting for container to be healthy...');
  const startTime = Date.now();

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT) {
    try {
      const response = await fetch(HEALTH_CHECK_URL);
      if (response.ok) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Container is healthy! (${elapsed}s)\n`);
        console.log(`   Frontend + API: http://localhost:${DOCKER_PORT}`);
        console.log(`   Health check:   ${HEALTH_CHECK_URL}\n`);
        return;
      }
    } catch {
      // Container not ready yet
    }

    // Check if container is still running
    try {
      const status = execSync(
        `docker inspect -f "{{.State.Status}}" ${CONTAINER_NAME}`,
        { encoding: 'utf-8' }
      ).trim();
      // Status might have quotes on some platforms, strip them
      const cleanStatus = status.replace(/['"]/, '');
      if (cleanStatus !== 'running') {
        console.error(
          `\n❌ Container stopped unexpectedly (status: ${cleanStatus})`
        );
        const logs = execSync(`docker logs ${CONTAINER_NAME}`, {
          encoding: 'utf-8',
        });
        console.error('Container logs:\n', logs);
        throw new Error('Container crashed during startup');
      }
    } catch (inspectError) {
      if (
        inspectError instanceof Error &&
        inspectError.message.includes('Container crashed')
      ) {
        throw inspectError;
      }
      // Ignore inspect errors
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r   Waiting... ${elapsed}s`);
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  // Timeout - show logs and fail
  console.error(
    `\n\n❌ Container health check timed out after ${HEALTH_CHECK_TIMEOUT / 1000}s`
  );
  try {
    const logs = execSync(`docker logs ${CONTAINER_NAME}`, {
      encoding: 'utf-8',
    });
    console.error('Container logs:\n', logs);
  } catch {
    console.error('Could not retrieve container logs');
  }

  throw new Error('Container health check timed out');
}
