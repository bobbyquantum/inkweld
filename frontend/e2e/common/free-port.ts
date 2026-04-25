/**
 * Dynamic port allocation for Playwright e2e tests.
 *
 * When running multiple worktrees or agent sessions simultaneously, hardcoded
 * ports cause conflicts. This utility finds free ports at config-load time so
 * each test run gets its own isolated set of ports.
 *
 * If the corresponding env var is already set (e.g. PLAYWRIGHT_FRONTEND_PORT),
 * that value is reused so callers can still pin ports when needed.
 *
 * @note TOCTOU race: getFreePort() releases the socket before the consumer
 * binds to it, so another process could claim the port in between. In practice
 * the window is tiny (~ms between config load and webServer spawn) and no
 * collisions have been observed. If this becomes an issue, either:
 *   (A) Keep the server socket reserved until just before consumer bind.
 *   (B) Use a retry-on-EADDRINUSE approach like the `get-port` package.
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
    const trimmed = fromEnv.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(
        `Invalid port in ${envVar}: ${JSON.stringify(fromEnv)}. Expected a positive integer.`
      );
    }
    const parsed = parseInt(trimmed, 10);
    if (parsed < 1 || parsed > 65535) {
      throw new Error(
        `Port out of range in ${envVar}: ${parsed}. Expected 1-65535.`
      );
    }
    return parsed;
  }
  return getFreePort();
}
