/**
 * Runtime helpers (minimal Y.Doc construction for MCP writes).
 *
 * This module is intentionally a placeholder reserved for the next
 * migration step. Exports a stable marker so tooling that statically
 * analyses the package's `./runtime` entry point sees a real symbol
 * instead of an empty `export {}` (Sonar S7787).
 */
export const RUNTIME_MODULE_PLACEHOLDER = true as const;
