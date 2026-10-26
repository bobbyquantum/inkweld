/**
 * Dotted-path writes into a Y.Map, shared by the Bun MCP runtime and the
 * project Durable Object's `POST /api/document` path updates.
 *
 * Worldbuilding templates key nested fields with a dot (`description.terrain`)
 * and the frontend stores them as a nested Y.Map (`description` → `terrain`).
 * Writing a dotted path therefore has to create any missing parent as a Y.Map;
 * elements created outside the UI may not have the parent yet.
 */
import type * as Y from 'yjs';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && value.constructor === Object;
}

// Build parents with the root's own Y.Map class: the document may come from a
// different yjs copy than this module (y-durableobjects bundles its own), and
// Yjs rejects types from another copy as "Unexpected content type".
function yMapClass(root: Y.Map<unknown>): new () => Y.Map<unknown> {
  return root.constructor as new () => Y.Map<unknown>;
}

/**
 * Why `parts` can't be written below `root`, or null when it can: a parent
 * that holds a value other than a map or plain object (e.g. a legacy text
 * field `description` when writing `description.terrain`). Check every path
 * before a transaction so a batch is never half applied.
 */
export function yMapPathConflict(root: Y.Map<unknown>, parts: string[]): string | null {
  if (parts.length === 0) return 'Empty path';
  const YMap = yMapClass(root);
  let container: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const existing: unknown =
      container instanceof YMap
        ? container.get(parts[i])
        : (container as Record<string, unknown>)[parts[i]];
    if (existing === undefined || existing === null) return null;
    if (!(existing instanceof YMap) && !isPlainObject(existing)) {
      return `Cannot write "${parts.join('.')}": "${parts.slice(0, i + 1).join('.')}" holds a ${typeof existing} value, not a nested object`;
    }
    container = existing;
  }
  return null;
}

/**
 * Set `value` at `parts` below `root`, creating intermediate Y.Maps as needed.
 *
 * A parent stored as a plain object (an older MCP write of a whole nested
 * object) is upgraded to a Y.Map holding the same entries. A parent holding
 * any other value is never overwritten, since that would lose data: this
 * throws instead (see `yMapPathConflict`).
 */
export function setYMapPath(root: Y.Map<unknown>, parts: string[], value: unknown): void {
  const conflict = yMapPathConflict(root, parts);
  if (conflict) throw new Error(conflict);
  const YMap = yMapClass(root);

  let container = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = container.get(key);
    if (existing instanceof YMap) {
      container = existing;
      continue;
    }
    const child = new YMap();
    container.set(key, child);
    if (isPlainObject(existing)) {
      for (const [k, v] of Object.entries(existing)) child.set(k, v);
    }
    container = child;
  }
  container.set(parts[parts.length - 1], value);
}

/**
 * Expand worldbuilding-map updates into dotted paths, the way the frontend
 * saves them: a dotted key addresses a nested field, and a plain-object value
 * merges into the nested map one level deep instead of replacing it.
 */
export function expandWorldbuildingPaths(
  updates: Record<string, unknown>
): Array<{ path: string; value: unknown }> {
  const paths: Array<{ path: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(updates)) {
    if (isPlainObject(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        paths.push({ path: `${key}.${childKey}`, value: childValue });
      }
    } else {
      paths.push({ path: key, value });
    }
  }
  return paths;
}

/** Flatten a nested plain object into dotted leaf paths (for identity `appearance`). */
export function flattenToPaths(
  value: Record<string, unknown>,
  prefix = ''
): Array<{ path: string; value: unknown }> {
  const paths: Array<{ path: string; value: unknown }> = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child)) paths.push(...flattenToPaths(child, path));
    else paths.push({ path, value: child });
  }
  return paths;
}
