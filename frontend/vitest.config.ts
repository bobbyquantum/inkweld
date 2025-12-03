/**
 * ❌ DO NOT RUN VITEST DIRECTLY
 *
 * This project uses Angular's test runner which configures vitest internally.
 * Running vitest directly bypasses path alias resolution (@inkweld/*, @services/*, etc.)
 *
 * Use: npm test
 */
throw new Error(
  '\n\n' +
    '╔════════════════════════════════════════════════════════════════╗\n' +
    '║  ❌ ERROR: Do not run vitest directly!                         ║\n' +
    '╠════════════════════════════════════════════════════════════════╣\n' +
    '║                                                                ║\n' +
    '║  This project must be tested using:                            ║\n' +
    '║                                                                ║\n' +
    '║      npm test                                                  ║\n' +
    '║                                                                ║\n' +
    '║  The Angular CLI (ng test) configures vitest with proper       ║\n' +
    '║  path aliases like @inkweld/*, @services/*, etc.               ║\n' +
    '║                                                                ║\n' +
    '╚════════════════════════════════════════════════════════════════╝\n'
);
