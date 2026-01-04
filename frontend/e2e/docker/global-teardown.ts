import { execSync } from 'child_process';

const CONTAINER_NAME = 'inkweld-e2e-test';

/**
 * Global teardown for Docker E2E tests.
 *
 * Stops and removes the test container.
 */
export default function globalTeardown(): void {
  // Check if we should keep the container running for debugging
  if (process.env['DOCKER_E2E_KEEP_CONTAINER']) {
    return;
  }

  try {
    // Show a quick summary of container stats
    execSync(
      `docker stats ${CONTAINER_NAME} --no-stream --format "CPU: {{.CPUPerc}}, Memory: {{.MemUsage}}"`,
      { encoding: 'utf-8' }
    );
  } catch {
    // Ignore stats errors
  }

  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: 'pipe' });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'pipe' });
  } catch {
    // Ignore
  }
}
