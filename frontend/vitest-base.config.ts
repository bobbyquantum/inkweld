/**
 * Vitest Base Configuration
 *
 * This file provides custom Vitest settings that extend the Angular CLI's configuration.
 * The Angular CLI will automatically detect this file when runnerConfig is set to true.
 *
 * Note: The Angular CLI overrides certain properties (test.projects, test.include).
 * See: https://angular.dev/guide/testing/migrating-to-vitest
 */
import { defineConfig } from 'vitest/config';

const isCI = process.env['CI'] === 'true';

export default defineConfig({
  test: {
    // This prevents hanging tests from blocking CI for too long
    testTimeout: 4000,

    // Hook timeout for beforeEach, afterEach, etc.
    hookTimeout: 8000,

    // Disable isolation for faster tests - each file shares environment
    // Tests must properly clean up after themselves (TestBed.resetTestingModule)
    isolate: false,

    // Retry flaky tests
    retry: 0,

    // Use forks pool for better performance (default is 'threads')
    // Forks are faster for Angular because they avoid thread overhead
    pool: 'forks',

    // Disable file watching in CI
    watch: !isCI,

    // Reporters - use dot reporter in CI for minimal output
    reporters: isCI ? ['dot'] : ['default'],
  },

  // Vitest 4+ pool options are now top-level
  // Use half the available CPUs (leaves room for other processes)
  // CI typically has 2 cores, local dev has more
  // forks: {
  //   minForks: isCI ? 2 : 4,
  //   maxForks: isCI ? 2 : 8,
  // },
});
