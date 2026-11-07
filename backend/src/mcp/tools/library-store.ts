/**
 * Shared plumbing for the MCP tools that edit a project library: the time
 * systems (`timeSystems`) and random generators (`generators`) arrays of the
 * project elements doc (`username:slug:elements/`). Those are the arrays the
 * app's `TimeSystemLibraryService` and `GeneratorLibraryService` read; the
 * data model, validation and roll engine come from `@inkweld/project-library`,
 * so the tools check a calendar or generator exactly as the app does.
 *
 * The app rewrites a whole array on every change; these tools change one row
 * in place, so an agent's edit doesn't undo a collaborator's change to another
 * row. Copies edited apart (a Worker's copy, another device) can merge into two
 * rows with one id, so readers keep the first and every write deletes the rest,
 * as the tag tools do (`tag-store.ts`).
 */

import type * as Y from 'yjs';
import type { McpContext, McpToolResult } from '../mcp.types';
import { logger } from '../../services/logger.service';
import { openEditableDocument } from '../../services/yjs-document-access';
import { deleteWhere } from './tag-store';

const mcpLibraryLog = logger.child('MCP-Library');

/** The library arrays these tools edit. */
export type LibraryArray = 'timeSystems' | 'generators';

/** Thrown inside a document edit to abort it with a tool error, before anything is written. */
export class LibraryToolError extends Error {}

/** A library row: an object with a string id. Other properties are kept as they are. */
export interface LibraryRow {
  id: string;
  name?: unknown;
  [prop: string]: unknown;
}

function isRow(value: unknown): value is LibraryRow {
  return !!value && typeof value === 'object' && typeof (value as LibraryRow).id === 'string';
}

/** The rows of `arrayName`, one per id (the first wins). */
export function readRows(doc: Y.Doc, arrayName: LibraryArray): LibraryRow[] {
  const seen = new Set<string>();
  return doc
    .getArray<unknown>(arrayName)
    .toArray()
    .filter((row): row is LibraryRow => {
      if (!isRow(row) || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}

/** Delete the duplicate rows `readRows` skips. Returns how many were removed. */
export function compactRows(doc: Y.Doc, arrayName: LibraryArray): number {
  const ids = new Set<string>();
  return deleteWhere(doc.getArray<unknown>(arrayName), (row) => {
    if (!isRow(row)) return false;
    if (ids.has(row.id)) return true;
    ids.add(row.id);
    return false;
  });
}

/** Replace the first row with `row.id` in place, keeping its position. */
export function replaceRow(doc: Y.Doc, arrayName: LibraryArray, row: { id: string }): void {
  const array = doc.getArray<unknown>(arrayName);
  const index = array.toArray().findIndex((r) => isRow(r) && r.id === row.id);
  if (index < 0) throw new LibraryToolError(`no row "${row.id}" to replace`);
  array.delete(index, 1);
  array.insert(index, [row]);
}

/** Delete every row with `id`. Returns how many were removed. */
export function deleteRow(doc: Y.Doc, arrayName: LibraryArray, id: string): number {
  return deleteWhere(doc.getArray<unknown>(arrayName), (r) => isRow(r) && r.id === id);
}

function rowName(row: { name?: unknown }): string {
  return typeof row.name === 'string' ? row.name : '';
}

/**
 * Find the row a reference names: its id, or else its name ignoring case.
 * Throws `LibraryToolError` listing what exists when nothing (or more than one
 * row by that name) matches. `kind` is e.g. "time system"; `listTool` the tool
 * that lists them.
 */
export function resolveRow<T extends { id: string; name?: unknown }>(
  rows: T[],
  ref: string,
  kind: string,
  listTool: string
): T {
  const trimmed = ref.trim();
  const byId = rows.find((r) => r.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  const byName = rows.filter((r) => rowName(r).trim().toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const ids = byName.map((r) => r.id).join(', ');
    throw new LibraryToolError(
      `more than one ${kind} is named "${ref}" (ids ${ids}): pass the id instead`
    );
  }
  const listed = rows.map((r) => `"${rowName(r)}" (${r.id})`).join(', ');
  const available =
    rows.length === 0 ? `This project has no ${kind}s yet.` : `Available: ${listed}.`;
  throw new LibraryToolError(`no ${kind} "${ref}" in this project. ${available} See ${listTool}.`);
}

/**
 * Run `edit` on the project elements doc in one transaction and persist it.
 * `edit` must throw `LibraryToolError` before writing anything when the
 * request is invalid. Read-only tools pass `commit: false`. A write also
 * removes duplicate rows of `arrayName` left by a merge.
 */
export async function withLibraryDoc<T>(
  ctx: McpContext,
  project: { username: string; slug: string },
  arrayName: LibraryArray,
  edit: (doc: Y.Doc) => T,
  options: { commit?: boolean } = {}
): Promise<T> {
  const editable = await openEditableDocument(`${project.username}:${project.slug}:elements/`, {
    env: ctx.env,
    authToken: ctx.authToken,
  });
  const write = options.commit !== false;
  const result = editable.doc.transact(() => {
    const value = edit(editable.doc);
    if (write) compactRows(editable.doc, arrayName);
    return value;
  });
  if (write) await editable.commit();
  return result;
}

export function textResult(text: string, structured: Record<string, unknown>): McpToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Run a library tool body, turning `LibraryToolError`s into tool errors. */
export async function runLibraryTool(
  name: string,
  projectKey: string,
  body: () => Promise<McpToolResult>
): Promise<McpToolResult> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof LibraryToolError) return errorResult(err.message);
    mcpLibraryLog.error(`${name} failed for ${projectKey}`, { error: err });
    return errorResult(
      `${name} failed for "${projectKey}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ============================================
// Argument helpers
// ============================================

export function requiredString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new LibraryToolError(`${name} is required`);
  }
  return value.trim();
}

export function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new LibraryToolError(`${name} must be a string`);
  return value.trim();
}

export function optionalBoolean(args: Record<string, unknown>, name: string): boolean | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new LibraryToolError(`${name} must be true or false`);
  return value;
}

/** An optional integer in `[min, max]`. */
export function optionalInteger(
  args: Record<string, unknown>,
  name: string,
  min: number,
  max: number
): number | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new LibraryToolError(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

export function optionalStringArray(
  args: Record<string, unknown>,
  name: string
): string[] | undefined {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new LibraryToolError(`${name} must be an array of strings`);
  }
  return value as string[];
}

/** Throw when a string is longer than `max` characters. */
export function assertMaxLength(value: string, name: string, max: number): void {
  if (value.length > max) {
    throw new LibraryToolError(`${name} is too long (at most ${max} characters)`);
  }
}

/** The project's element names, for excluding names already in use. */
export function readElementNames(doc: Y.Doc): string[] {
  return doc
    .getArray<unknown>('elements')
    .toArray()
    .flatMap((value) => {
      const name = (value as { name?: unknown } | null)?.name;
      return typeof name === 'string' && name.trim() ? [name] : [];
    });
}

export const projectProperty = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use list_projects to discover projects.',
} as const;
