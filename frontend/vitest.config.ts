import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setup-vitest.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        '**/setup-vitest.ts',
        '**/e2e/**',
        '**/testing/**',
        '**/environments/**',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/main.ts',
        '**/api-client/**',
      ],
      // Fix source map resolution for correct file paths in lcov
      clean: true,
      cleanOnRerun: true,
    },
  },
});
