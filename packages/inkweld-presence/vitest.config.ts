import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the `@inkweld/presence` shared package.
 *
 * Tests live in `./test` and import the package's source directly via
 * relative paths so coverage is measured against `./src`. Coverage is
 * emitted as `lcov` for SonarCloud (see `sonar-project.properties`).
 */
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 80,
        functions: 80,
        lines: 80,
        branches: 60,
      },
    },
  },
});
