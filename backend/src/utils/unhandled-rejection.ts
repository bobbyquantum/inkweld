/**
 * Process-level backstop for promise rejections nothing handled.
 *
 * `bun-runner.ts` and `node-runner.ts` register this logger at startup, so
 * such a rejection is logged and the server keeps running.
 *
 * It is a backstop, not error handling: code that starts work it does not
 * await still catches its own failures. Uncaught synchronous exceptions are
 * deliberately left to the runtime's default.
 */
import { logger } from '../services/logger.service';

/** Log a rejection that reached the process without a handler. */
export function logUnhandledRejection(reason: unknown): void {
  logger.error('Process', 'Unhandled promise rejection; the server keeps running', reason);
}

/**
 * Register {@link logUnhandledRejection} as the process's `unhandledRejection`
 * listener (once, however often it is called). Returns a function that
 * removes it again.
 */
export function installUnhandledRejectionLogger(): () => void {
  if (!process.listeners('unhandledRejection').includes(logUnhandledRejection)) {
    process.on('unhandledRejection', logUnhandledRejection);
  }
  return () => {
    process.off('unhandledRejection', logUnhandledRejection);
  };
}
