/**
 * Bun runtime entrypoint
 * Uses native bun:sqlite for database operations
 */
import { checkAndRunSetup } from './setup-wizard';

// Check if running as compiled binary and if setup is needed
const isCompiled = typeof Bun.main === 'string' && !Bun.main.includes('node_modules');
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

if (isCompiled && isInteractive) {
  // Run setup wizard if needed (checks for .env files automatically)
  await checkAndRunSetup();
}

// Import config and app AFTER setup wizard has run
const { config } = await import('./config/env');
const { logger } = await import('./services/logger.service');
const bunAppModule = await import('./bun-app');

logger.info('BunRunner', `Server starting on port ${config.port}`, {
  nodeEnv: config.nodeEnv,
  version: config.version,
});

export default bunAppModule.default;
