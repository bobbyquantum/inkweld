/**
 * Dynamic port allocation for Playwright e2e tests.
 *
 * When running multiple worktrees or agent sessions simultaneously, hardcoded
 * ports cause conflicts. This utility finds free ports at config-load time so
 * each test run gets its own isolated set of ports.
 *
 * If the corresponding env var is already set (e.g. PLAYWRIGHT_FRONTEND_PORT),
 * that value is reused so callers can still pin ports when needed.
 */

import * as net from 'net';

/**
 * Returns a free TCP port on localhost, binding to port 0 and reading back
 * the OS-assigned port before immediately releasing the socket.
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine free port')));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Returns the value of an env var as a number if set, otherwise finds a free
 * port. This allows callers to override dynamic allocation via environment.
 */
export async function getPort(envVar: string): Promise<number> {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    const parsed = parseInt(fromEnv, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return getFreePort();
}
