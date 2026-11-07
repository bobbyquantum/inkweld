/**
 * Random generator models.
 *
 * Lives in `@inkweld/project-library` (`packages/inkweld-project-library/src/generator.ts`),
 * shared with the backend's MCP tools; this module re-exports it for the app.
 */
export {
  cloneGenerator,
  createEmptyGenerator,
  DEFAULT_GENERATOR_ICON,
  formatEntryLines,
  type Generator,
  GENERATOR_CATEGORIES,
  type GeneratorEntry,
  type GeneratorRule,
  parseEntryLines,
  RULE_KEY_PATTERN,
} from '@inkweld/project-library';
