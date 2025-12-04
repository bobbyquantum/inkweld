import { execSync } from 'child_process';

const CONTAINER_NAME = 'inkweld-e2e-test';

/**
 * Global teardown for Docker E2E tests.
 *
 * Stops and removes the test container.
 */
export default function globalTeardown(): void {
  console.log('\n🐳 Docker E2E Teardown');
  console.log('=====================\n');

  // Check if we should keep the container running for debugging
  if (process.env['DOCKER_E2E_KEEP_CONTAINER']) {
    console.log(
      '⚠️  DOCKER_E2E_KEEP_CONTAINER is set - leaving container running'
    );
    console.log(
      `   To stop manually: docker stop ${CONTAINER_NAME} && docker rm ${CONTAINER_NAME}`
    );
    console.log(`   Container URL: http://localhost:8333\n`);
    return;
  }

  try {
    // Show a quick summary of container stats
    const stats = execSync(
      `docker stats ${CONTAINER_NAME} --no-stream --format "CPU: {{.CPUPerc}}, Memory: {{.MemUsage}}"`,
      { encoding: 'utf-8' }
    ).trim();
    console.log(`📊 Final container stats: ${stats}`);
  } catch {
    // Ignore stats errors
  }

  console.log(`🧹 Stopping container ${CONTAINER_NAME}...`);

  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
    console.log('✅ Container stopped and removed\n');
  } catch {
    console.warn(`⚠️  Could not stop container (may already be stopped)`);
  }
}
