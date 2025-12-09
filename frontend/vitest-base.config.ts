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

export default defineConfig({
  test: {
    // Set reasonable test timeout (1 second instead of vitest's default)
    // This prevents hanging tests from blocking CI for too long
    testTimeout: 1500,

    // Hook timeout for beforeEach, afterEach, etc.
    hookTimeout: 5000,
  },
});
