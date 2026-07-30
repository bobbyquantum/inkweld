/**
 * Yjs snapshot inspection helpers.
 *
 * These decode a persisted Yjs state (a compacted snapshot, or any encoded
 * update) in a *throwaway* `Y.Doc` so callers can ask "does this state hold any
 * content?" or "is this state the empty/blank state?" without mutating live
 * documents or storage. They are the single source of truth for the Y-decoding
 * logic used by both the Durable Object's compaction regression guard and the
 * read-only storage diagnostic, so the two never drift (and so the decoding is
 * unit-testable under Bun, which the DO class itself is not).
 *
 * Why this exists — the compaction regression guard:
 *   Compaction is mathematically client-transparent (a snapshot replays to the
 *   same state as the incrementals it replaces). But an *unguarded* compaction
 *   of an in-memory doc that failed to load its history (a blank doc whose
 *   state vector is empty) overwrites a good stored snapshot with a blank one
 *   AND deletes the incrementals — sealing a regression and destroying the only
 *   recovery path. The discriminator between "failed-load blank" and a real,
 *   deliberately-emptied tree is the **state vector**: a blank doc has an empty
 *   state vector (`Y.encodeStateVector` ≈ `[0]`), whereas any doc that has ever
 *   applied an operation — including one whose elements were all deleted — has
 *   an advanced (non-empty) state vector. `isBlankStateVector` captures exactly
 *   that, so the guard blocks the regression without blocking legitimate edits.
 */

import * as Y from 'yjs';

/** Decoded content metrics for a snapshot, used by the storage diagnostic. */
export interface SnapshotContent {
  /** Length of the top-level `elements` array, or null when absent/undecodable. */
  elementCount: number | null;
  /** Sizes of the other known top-level containers present in the state. */
  topLevel: Record<string, number>;
}

/** Apply `bytes` into a fresh throwaway doc. Returns null if it can't decode. */
function applyIntoThrowaway(bytes: Uint8Array): Y.Doc | null {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, bytes);
    return doc;
  } catch {
    try {
      doc.destroy();
    } catch {
      /* already torn down */
    }
    return null;
  }
}

/**
 * True when `bytes` encodes a state with an empty state vector — i.e. a doc
 * that has never had any operation applied (a blank / failed-load doc). A doc
 * whose content was genuinely deleted returns false: the deletes are real
 * operations, so the state vector is advanced.
 */
export function isBlankStateVector(bytes: Uint8Array): boolean {
  const doc = applyIntoThrowaway(bytes);
  if (!doc) return false;
  try {
    const sv = Y.encodeStateVector(doc);
    // An empty state vector encodes to a single varUint(0) byte. Any applied
    // operation adds at least one (clientID, clock) pair, growing it past 1.
    return sv.byteLength < 2;
  } finally {
    doc.destroy();
  }
}

/** Read the known top-level containers from a throwaway decode of `bytes`. */
export function decodeSnapshotMetrics(bytes: Uint8Array): SnapshotContent {
  const doc = applyIntoThrowaway(bytes);
  if (!doc) return { elementCount: null, topLevel: {} };
  try {
    const topLevel: Record<string, number> = {};
    let elementCount: number | null = null;
    try {
      elementCount = doc.getArray('elements').length;
      topLevel.elements = elementCount;
    } catch {
      /* no elements container */
    }
    try {
      topLevel.relationships = doc.getArray('relationships').length;
    } catch {
      /* none */
    }
    try {
      topLevel.worldbuilding = doc.getMap('worldbuilding').size;
    } catch {
      /* none */
    }
    try {
      topLevel.prosemirror = doc.getXmlFragment('prosemirror').length;
    } catch {
      /* none */
    }
    return { elementCount, topLevel };
  } finally {
    doc.destroy();
  }
}

/**
 * True when `bytes` decodes to a state holding any content in a known
 * container. Returns true on a decode failure too — the safe default: when we
 * can't read the stored state we must assume it has content so the compaction
 * guard preserves it rather than overwriting an undecodable-but-present
 * snapshot with a blank one.
 */
export function hasDocContent(bytes: Uint8Array | undefined): boolean {
  if (!bytes) return false;
  const { elementCount, topLevel } = decodeSnapshotMetrics(bytes);
  if (elementCount === null) {
    // Decode failed (applyIntoThrowaway returned null) → safe default.
    return true;
  }
  if (elementCount > 0) return true;
  for (const key of Object.keys(topLevel)) {
    if (topLevel[key] > 0) return true;
  }
  return false;
}
