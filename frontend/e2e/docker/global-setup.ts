import { request } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';

const CONTAINER_NAME = 'inkweld-e2e-test';
const DOCKER_PORT = 9333;
const HEALTH_CHECK_URL = `http://localhost:${DOCKER_PORT}/api/v1/health`;
const API_BASE_URL = `http://localhost:${DOCKER_PORT}`;
const HEALTH_CHECK_TIMEOUT = 180000; // 3 minutes for image build + startup
const HEALTH_CHECK_INTERVAL = 2000;

const ADMIN_CREDENTIALS = {
  username: 'e2e-admin',
  password: 'E2eAdminPassword123!',
};

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

  // Stop any existing container

  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
  } catch {
    // Container doesn't exist, that's fine
  }

  // Build the image using docker compose

  execSync('docker compose build inkweld', {
    cwd: rootDir,
    stdio: 'inherit',
  });

  // Start the container with test configuration

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
    // Default admin for admin e2e tests
    '-e',
    'DEFAULT_ADMIN_USERNAME=e2e-admin',
    '-e',
    'DEFAULT_ADMIN_PASSWORD=E2eAdminPassword123!',
    // Disable AI kill switch to allow AI feature testing (matches online config)
    '-e',
    'AI_KILL_SWITCH=false',
    // Enable AI image generation for e2e testing
    '-e',
    'AI_IMAGE_ENABLED=true',
    'inkweld-inkweld',
  ];

  try {
    execSync(`docker ${dockerArgs.join(' ')}`, {
      cwd: rootDir,
      stdio: 'pipe',
    });
  } catch (error) {
    // Show container logs if available
    try {
      execSync(`docker logs ${CONTAINER_NAME}`, {
        encoding: 'utf-8',
      });
    } catch {
      // Ignore
    }
    throw error;
  }

  // Show initial container logs to help debug startup issues

  try {
    execSync(`docker logs ${CONTAINER_NAME}`, {
      encoding: 'utf-8',
    });
  } catch {
    // Ignore
  }

  // Check container status immediately

  try {
    const status = execSync(
      `docker inspect -f "{{.State.Status}}" ${CONTAINER_NAME}`,
      { encoding: 'utf-8' }
    ).trim();
    const cleanStatus = status.replace(/['"]/g, '');

    if (cleanStatus !== 'running') {
      execSync(`docker logs ${CONTAINER_NAME}`, {
        encoding: 'utf-8',
      });

      throw new Error(`Container not running: ${cleanStatus}`);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Container not running')
    ) {
      throw error;
    }
  }

  // Wait for health check

  const startTime = Date.now();
  let lastLogTime = -10; // Start at -10 so first log happens immediately

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const shouldLog = elapsed - lastLogTime >= 10;

    try {
      // Add timeout to fetch to prevent hanging
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(HEALTH_CHECK_URL, {
        signal: controller.signal,
      });
      clearTimeout(fetchTimeout);

      if (response.ok) {
        // Health check passed, now set up AI configuration
        await setupAIConfiguration();
        return;
      } else if (shouldLog) {
        lastLogTime = elapsed;
      }
    } catch {
      // Container not ready yet - log periodically (every 10s)
      if (shouldLog) {
        lastLogTime = elapsed;
      }
    }

    // Check if container is still running
    try {
      const status = execSync(
        `docker inspect -f "{{.State.Status}}" ${CONTAINER_NAME}`,
        { encoding: 'utf-8' }
      ).trim();
      // Status might have quotes on some platforms, strip them
      const cleanStatus = status.replace(/['"]/g, '');
      if (cleanStatus !== 'running') {
        execSync(`docker logs ${CONTAINER_NAME}`, {
          encoding: 'utf-8',
        });

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

    // Every 30 seconds, show the latest logs to help debug
    if (elapsed > 0 && elapsed % 30 === 0 && elapsed !== lastLogTime) {
      try {
        execSync(`docker logs --tail 20 ${CONTAINER_NAME}`, {
          encoding: 'utf-8',
        });

        lastLogTime = elapsed;
      } catch {
        // Ignore log errors
      }
    }

    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL));
  }

  // Timeout - show logs and fail
  try {
    execSync(`docker logs ${CONTAINER_NAME}`, {
      encoding: 'utf-8',
    });
  } catch {
    // Ignore
  }

  throw new Error('Container health check timed out');
}

/**
 * Set up AI image generation configuration for e2e tests.
 * This must run after the container is healthy.
 */
async function setupAIConfiguration(): Promise<void> {
  console.log('\n🤖 Setting up AI image generation for Docker e2e tests...\n');

  const context = await request.newContext({ baseURL: API_BASE_URL });

  try {
    // Login as admin
    const loginResponse = await context.post('/api/v1/auth/login', {
      data: {
        username: ADMIN_CREDENTIALS.username,
        password: ADMIN_CREDENTIALS.password,
      },
    });

    if (!loginResponse.ok()) {
      console.log(`   ⚠️  Admin login failed: ${loginResponse.status()}`);
      console.log('   AI image generation tests may fail\n');
      return;
    }

    const loginData = (await loginResponse.json()) as { token: string };
    console.log('   ✅ Admin login successful');

    // Set fake OpenAI API key
    const keyResponse = await context.put('/api/v1/ai/providers/openai/key', {
      headers: {
        Authorization: `Bearer ${loginData.token}`,
        'Content-Type': 'application/json',
      },
      data: {
        apiKey: 'sk-fake-test-key-1234567890abcdefghijklmnopqrstuv',
      },
    });

    if (keyResponse.ok()) {
      console.log('   ✅ Set fake OpenAI API key');
    } else {
      console.log(`   ⚠️  Could not set API key: ${keyResponse.status()}`);
    }

    // Create test image profile
    const profileResponse = await context.post('/api/v1/admin/image-profiles', {
      headers: {
        Authorization: `Bearer ${loginData.token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'E2E-Docker-Test-Profile',
        description: 'Test profile for Docker e2e tests',
        provider: 'openai',
        modelId: 'gpt-image-1',
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
        defaultSize: '1024x1024',
        sortOrder: 0,
      },
    });

    if (profileResponse.ok()) {
      console.log('   ✅ Created E2E image profile\n');
    } else if (profileResponse.status() === 409) {
      console.log('   ✅ E2E image profile already exists\n');
    } else {
      console.log(
        `   ⚠️  Could not create profile: ${profileResponse.status()}\n`
      );
    }
  } finally {
    await context.dispose();
  }
}
