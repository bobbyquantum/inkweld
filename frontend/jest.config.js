/** @type {import('jest').Config} */
const config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '@components/(.*)': '<rootDir>/src/app/components/$1',
    '@dialogs/(.*)': '<rootDir>/src/app/dialogs/$1',
    '@services/(.*)': '<rootDir>/src/app/services/$1',
    '@themes/(.*)': '<rootDir>/src/themes/$1',
    '@inkweld/(.*)': '<rootDir>/src/api-client/$1',
    '^lodash-es$': 'lodash',
  },
  roots: ['<rootDir>/src/'],
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'lcov', 'text'],
  coveragePathIgnorePatterns: ['/node_modules/', '/src/api-client'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 55,
      functions: 75,
      lines: 80,
    },
  },
  moduleFileExtensions: ['ts', 'html', 'js', 'json', 'mjs'],
  transform: {
    '^.+\\.(ts|js|mjs|html|svg)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\.(html|svg)$',
      },
    ],
  },
  cacheDirectory: '<rootDir>/.jest-cache',
  transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
  moduleDirectories: ['node_modules', '<rootDir>'],
  silent: false, // Disable console logs during tests
  logHeapUsage: true, // Help identify memory leaks
  detectOpenHandles: true, // Help identify async issues
};

module.exports = config;
