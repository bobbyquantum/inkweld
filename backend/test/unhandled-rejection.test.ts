import { describe, expect, it, spyOn } from 'bun:test';
import { join } from 'node:path';
import { logger } from '../src/services/logger.service';
import {
  installUnhandledRejectionLogger,
  logUnhandledRejection,
} from '../src/utils/unhandled-rejection';

/**
 * bun-runner.ts and node-runner.ts register this listener at startup, so a
 * promise rejection that nothing handled is logged and the server keeps
 * running.
 *
 * The test runner reports any unhandled rejection in its own process as a
 * failure, so the end-to-end case runs in a child Bun process.
 */

const MODULE = join(import.meta.dir, '../src/utils/unhandled-rejection.ts');

/** Run a child Bun that rejects a promise nobody handles, then keeps working for a moment. */
function runChild(installLogger: boolean): { exitCode: number; stdout: string; stderr: string } {
  const script = [
    `const { installUnhandledRejectionLogger } = await import(${JSON.stringify(MODULE)});`,
    installLogger ? 'installUnhandledRejectionLogger();' : '',
    "void Promise.reject(new Error('nobody awaits this'));",
    "setTimeout(() => console.log('still running'), 50);",
  ].join('\n');
  const result = Bun.spawnSync({
    cmd: [process.execPath, '-e', script],
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'test' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe('unhandled rejection logger', () => {
  const registered = () =>
    process.listeners('unhandledRejection').filter((l) => l === logUnhandledRejection);

  it('logs the rejection reason as an error', () => {
    const errorSpy = spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      const reason = new Error('stray rejection');
      logUnhandledRejection(reason);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toBe('Process');
      expect(errorSpy.mock.calls[0][2]).toBe(reason);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('registers once however often it is installed, and can be removed', () => {
    const remove = installUnhandledRejectionLogger();
    installUnhandledRejectionLogger();
    try {
      expect(registered()).toHaveLength(1);
    } finally {
      remove();
    }
    expect(registered()).toHaveLength(0);
  });

  it('keeps the process running after a rejection nothing else catches', () => {
    const { exitCode, stdout, stderr } = runChild(true);
    expect(exitCode).toBe(0);
    expect(stderr).toContain('Unhandled promise rejection');
    expect(stdout).toContain('still running');
  });

  it('is what keeps it running: without it the process exits', () => {
    const { exitCode, stdout } = runChild(false);
    expect(exitCode).not.toBe(0);
    expect(stdout).not.toContain('still running');
  });
});
