/**
 * Duplicate-id deduplication planner for the Yjs elements document.
 *
 * Background — why duplicates exist:
 *   The elements document holds several top-level `Y.Array`s of id-bearing
 *   objects (the "bundle": elements, plans, relationships, …). A `Y.Array`
 *   never dedupes by `id` — it is a positional sequence. When two authorities
 *   each seed the *same* logical tree into the array (e.g. a server recreate
 *   plus a client pushing its IndexedDB copy on connect) CRDT concatenates the
 *   two seeds positionally: the rows have different clientIDs/clocks but
 *   identical `.id` fields, so the array ends up with N rows that are really
 *   N/2 elements shown twice. Because the browser renders straight from its
 *   local `Y.Doc` (not from any REST read), these duplicates are visible in the
 *   UI and propagate to every client's IndexedDB via sync.
 *
 * What this planner decides:
 *   Given the array's rows (as plain JSON, in array order), group them by `id`
 *   and, for every id that appears more than once, classify the group:
 *     - **collapsed** — every duplicate row is *content-identical*. The extras
 *       are provably safe to delete (lossless): one surviving row is byte-for-
 *       byte the same as the ones removed. This is the double-seed case and the
 *       only case the Durable Object auto-heals.
 *     - **conflicting** — the duplicate rows *differ* in content (one copy was
 *       edited). The planner does NOT choose a winner: deleting either copy
 *       would discard a real edit. These ids are reported so a human / the
 *       divergence flow can resolve them; the auto-heal leaves them untouched.
 *
 * Equality is **key-order-independent** (`canonicalStringify`): two CRDT-merged
 * copies of the same object can carry their Y.Map keys in different insertion
 * order, so a naive `JSON.stringify` would call identical content "different"
 * and wrongly refuse to collapse it. Arrays keep element order (order is
 * meaningful content there).
 *
 * The planner is pure (no Yjs import) so it is unit-testable under Bun; the DO
 * supplies the rows by reading each `Y.Array` through `yValueToJson`.
 */

/**
 * The id-bearing top-level arrays that make up the elements document "bundle".
 * Must mirror the set the frontend observes in
 * `yjs-element-sync.provider.ts#setupDocumentObserver` — a duplicate-id seed
 * affects every one of them, so the heal covers the whole bundle in a single
 * transaction. `projectMeta` is intentionally excluded (it is a `Y.Map`).
 */
export const ELEMENT_BUNDLE_ARRAYS = [
  'elements',
  'publishPlans',
  'relationships',
  'customRelationshipTypes',
  'schemas',
  'timeSystems',
  'mediaTags',
  'mediaProjectTags',
] as const;

/** A row as seen by the planner: a plain object, or null when not dedupeable. */
export type DedupeRow = Record<string, unknown> | null | undefined;

/** Result of {@link planIdenticalDedupe}. */
export interface DedupePlan {
  /** Array indices to delete — only the *extra* rows of content-identical groups. */
  deleteIndices: number[];
  /** Ids collapsed (had identical-content duplicates; extras scheduled for delete). */
  collapsedIds: string[];
  /** Ids with differing-content duplicates — reported, never auto-deleted. */
  conflictingIds: string[];
}

/**
 * Stable, key-order-independent serialization for content equality. Object keys
 * are sorted recursively; arrays preserve order; primitives defer to
 * `JSON.stringify`. Two values are content-equal iff their canonical forms are.
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function rowId(row: DedupeRow): string | null {
  if (!row || typeof row !== 'object') return null;
  const id = row.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Build a dedupe plan for one array's rows (in array order). Only
 * content-identical duplicate groups yield deletions; differing-content groups
 * are reported via `conflictingIds` and left intact. Rows without a string `id`
 * are ignored (they cannot be deduped and are never deleted).
 */
export function planIdenticalDedupe(rows: readonly DedupeRow[]): DedupePlan {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const id = rowId(rows[i]);
    if (id === null) continue;
    const list = groups.get(id);
    if (list) list.push(i);
    else groups.set(id, [i]);
  }

  const deleteIndices: number[] = [];
  const collapsedIds: string[] = [];
  const conflictingIds: string[] = [];

  for (const [id, indices] of groups) {
    if (indices.length < 2) continue;
    const canonical = canonicalStringify(rows[indices[0]]);
    const allIdentical = indices.every((idx) => canonicalStringify(rows[idx]) === canonical);
    if (allIdentical) {
      collapsedIds.push(id);
      // Keep the first occurrence, delete the rest.
      for (let j = 1; j < indices.length; j++) deleteIndices.push(indices[j]);
    } else {
      conflictingIds.push(id);
    }
  }

  return { deleteIndices, collapsedIds, conflictingIds };
}
