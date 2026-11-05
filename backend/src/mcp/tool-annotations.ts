import type { McpToolAnnotations } from './mcp.types';

/**
 * Annotation presets shared by the MCP tools. Every tool picks one, so no tool
 * is left without hints (a client treats a missing `destructiveHint` on a
 * non-read-only tool as `true`). `destructiveHint` is only for tools that
 * delete or wholesale replace data; see `backend/AGENTS.md`.
 */

/** Only reads project data. */
export const READ_ONLY_TOOL: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Adds or changes data; calling it again with the same arguments adds more. */
export const WRITE_TOOL: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/** Adds or changes data; calling it again with the same arguments changes nothing more. */
export const IDEMPOTENT_WRITE_TOOL: McpToolAnnotations = {
  ...WRITE_TOOL,
  idempotentHint: true,
};

/** Deletes or wholesale replaces data. The only preset that sets `destructiveHint`. */
export const DESTRUCTIVE_TOOL: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

/** Writes data and talks to an outside service (an image provider). */
export const OPEN_WORLD_WRITE_TOOL: McpToolAnnotations = {
  ...WRITE_TOOL,
  openWorldHint: true,
};
