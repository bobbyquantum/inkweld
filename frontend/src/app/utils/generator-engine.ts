/**
 * Random generator expansion engine.
 *
 * Lives in `@inkweld/project-library` (`packages/inkweld-project-library/src/generator-engine.ts`),
 * shared with the backend's MCP tools; this module re-exports it for the app.
 */
export {
  type GeneratorIssue,
  type GeneratorIssueCode,
  type GeneratorIssueSeverity,
  isGeneratorValid,
  MAX_EXPANSION_CHARS,
  MAX_EXPANSION_DEPTH,
  MAX_EXPANSIONS,
  MAX_OUTPUT_LENGTH,
  MODIFIER_NAMES,
  mulberry32,
  parseReferences,
  rollGenerator,
  type RollOptions,
  type RollResult,
  validateGenerator,
} from '@inkweld/project-library';
