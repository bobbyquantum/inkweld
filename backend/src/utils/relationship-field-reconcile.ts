/**
 * Make relationship fields link exactly the ids asked for, on the document
 * that holds the project's relationships (`relationships` Y.Array of the
 * project elements doc).
 *
 * The plan (`planRelationshipFieldLinks`) is made inside the transaction that
 * applies it, against the relationships and elements as they are then. Run on
 * the one shared document (Bun's live doc, or the project Durable Object's),
 * that serialises concurrent MCP writes: two updates of a single-valued field
 * can't both add a link. Run on a copy, they could, which is why the Worker
 * path sends the request to the Durable Object (`action: 'reconcile'` on
 * `POST /api/document`) instead of planning on its copy.
 */

import { planRelationshipFieldLinks } from '@inkweld/project-library';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

/** A relationship as stored in the relationships array. */
export interface StoredRelationship {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  relationshipTypeId: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** One relationship field to set: its element, its type and the ids it should link. */
export interface RelationshipFieldReconcile {
  sourceElementId: string;
  relationshipTypeId: string;
  desiredIds: string[];
}

/** What reconciling one field did, in the order the requests were given. */
export interface RelationshipFieldReconcileResult {
  sourceElementId: string;
  relationshipTypeId: string;
  /** The relationships created. */
  added: StoredRelationship[];
  /** The relationships deleted. */
  removed: StoredRelationship[];
}

/**
 * Why `value` isn't a list of reconcile requests, or null when it is. The
 * Durable Object checks a request body with it before touching the document.
 */
export function relationshipFieldReconcileError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return 'reconcile needs a non-empty "fields" array';
  }
  for (const item of value as unknown[]) {
    const field = item as Partial<RelationshipFieldReconcile> | null;
    if (
      !field ||
      typeof field.sourceElementId !== 'string' ||
      !field.sourceElementId ||
      typeof field.relationshipTypeId !== 'string' ||
      !field.relationshipTypeId ||
      !Array.isArray(field.desiredIds) ||
      !field.desiredIds.every((id) => typeof id === 'string')
    ) {
      return 'each reconcile field needs sourceElementId, relationshipTypeId and desiredIds (strings)';
    }
  }
  return null;
}

function elementIdsOf(doc: Y.Doc): Set<string> {
  const ids = new Set<string>();
  doc.getArray('elements').forEach((value) => {
    const id =
      value instanceof Y.Map
        ? (value.get('id') as unknown)
        : (value as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.add(id);
  });
  return ids;
}

/**
 * Reconcile each field in one transaction on `doc`: add a relationship for
 * every wanted id the field doesn't link yet, and delete links to ids no
 * longer wanted, to deleted elements, and duplicates (which also heals a
 * single-valued field that concurrent copies left with two links). Ids of
 * elements not in the document are skipped.
 */
export function reconcileRelationshipFieldsInDoc(
  doc: Y.Doc,
  fields: readonly RelationshipFieldReconcile[],
  options: { now?: string; newId?: () => string } = {}
): RelationshipFieldReconcileResult[] {
  const now = options.now ?? new Date().toISOString();
  const newId = options.newId ?? (() => nanoid());
  const relationshipsArray = doc.getArray<StoredRelationship>('relationships');

  return doc.transact(() => {
    const elementIds = elementIdsOf(doc);
    const current = relationshipsArray.toArray();
    const results = fields.map((field): RelationshipFieldReconcileResult => {
      const plan = planRelationshipFieldLinks({
        sourceElementId: field.sourceElementId,
        relationshipTypeId: field.relationshipTypeId,
        desiredIds: field.desiredIds,
        relationships: current,
        elementExists: (id) => elementIds.has(id),
      });
      return {
        sourceElementId: field.sourceElementId,
        relationshipTypeId: field.relationshipTypeId,
        removed: plan.remove,
        added: plan.add.map((targetElementId) => ({
          id: newId(),
          sourceElementId: field.sourceElementId,
          targetElementId,
          relationshipTypeId: field.relationshipTypeId,
          createdAt: now,
          updatedAt: now,
        })),
      };
    });

    const removeIds = new Set(results.flatMap((result) => result.removed.map((r) => r.id)));
    // From the end, so earlier indexes stay valid while deleting.
    for (let index = relationshipsArray.length - 1; index >= 0; index--) {
      const relationship = relationshipsArray.get(index);
      if (relationship && removeIds.has(relationship.id)) relationshipsArray.delete(index, 1);
    }
    const added = results.flatMap((result) => result.added);
    if (added.length > 0) relationshipsArray.push(added);
    return results;
  });
}
