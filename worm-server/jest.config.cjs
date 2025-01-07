// jest.config.cjs
module.exports = {
  // The official ts-jest ESM preset
  preset: 'ts-jest/presets/default-esm',

  // Nest typically runs in Node environment
  testEnvironment: 'node',

  // Let Jest know which file extensions to treat as ESM
  extensionsToTreatAsEsm: ['.ts'],
  transform: {},
  // transform: {
  //   // Transform TS and JS files via ts-jest, with ESM turned on
  //   '^.+\\.(t|j)s$': [
  //     'ts-jest',
  //     {
  //       useESM: true,
  //     },
  //   ],
  // },

  // By default, Jest won't transform anything in node_modules.
  // We NEED to transform `@modelcontextprotocol/sdk` because it's ESM-only.
  // transformIgnorePatterns: ['node_modules/(?!@modelcontextprotocol/sdk)'],

  // Allows .js imports in TS files to be mapped back to .ts
  // (Though you might not strictly need this if everything's .ts)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // The rest of your coverage, etc., can live here...
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
// "jest": {
//   "moduleFileExtensions": [
//     "js",
//     "json",
//     "ts"
//   ],
//   "rootDir": "src",
//   "testRegex": ".*\\.spec\\.ts$",
//   "transform": {
//     "^.+\\.(t|j)s$": ["ts-jest", {
//       "useESM": true
//     }]
//   },
//   "extensionsToTreatAsEsm": [".ts"],
//   "moduleNameMapper": {
//     "^(\\.{1,2}/.*)\\.js$": "$1"
//   },
//   "collectCoverageFrom": [
//     "**/*.(t|j)s"
//   ],
//   "coverageDirectory": "../coverage",
//   "testEnvironment": "node"
// },
