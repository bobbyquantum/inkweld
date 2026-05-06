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
  // Force a single copy of `prosemirror-model` and `yjs` across the bundle.
  // Source files under `packages/inkweld-prosemirror/src` import these
  // packages for types only — but Vite's resolver can still pick up the
  // package's own `node_modules` if one exists, producing TWO Schema/Y.Doc
  // constructors. ProseMirror throws "looks like multiple versions of
  // prosemirror-model were loaded" when this happens. Deduping at the
  // resolver level guarantees a single instance. See PR #1068.
  resolve: {
    dedupe: ['prosemirror-model', 'yjs'],
  },
  test: {
    // This prevents hanging tests from blocking CI for too long
    testTimeout: 6000,

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

    // Reporters - use dot reporter in CI for cleaner output
    reporters: isCI ? ['dot'] : ['default'],

    // Suppress EnvironmentTeardownError from isolate:false console log race.
    // With isolate:false, pending console.log RPC messages can arrive after
    // the worker starts tearing down. This is harmless and non-deterministic.
    onUnhandledError(error) {
      if (
        error.name === 'EnvironmentTeardownError' &&
        error.message?.includes('onUserConsoleLog')
      ) {
        return false;
      }
    },
  },

  // Vitest 4+ pool options are now top-level
  // Use half the available CPUs (leaves room for other processes)
  // CI typically has 2 cores, local dev has more
  // forks: {
  //   minForks: isCI ? 2 : 4,
  //   maxForks: isCI ? 2 : 8,
  // },
});
