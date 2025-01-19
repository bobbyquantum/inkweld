// jest.config.cjs
module.exports = {
  // The official ts-jest ESM preset
  preset: 'ts-jest/presets/default-esm',

  // Nest typically runs in Node environment
  testEnvironment: 'node',

  // Let Jest know which file extensions to treat as ESM
  extensionsToTreatAsEsm: ['.ts'],
  transform: {},

  // Allows .js imports in TS files to be mapped back to .ts
  // (Though you might not strictly need this if everything's .ts)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // The rest of your coverage, etc., can live here...
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
};
