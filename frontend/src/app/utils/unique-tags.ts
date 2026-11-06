import type { ElementTag, TagDefinition } from '@models/tag.model';

/**
 * Tag lists as the app reads them from the project elements doc.
 *
 * Copies of the doc edited apart (two devices, an MCP agent on a Worker)
 * merge as CRDTs, so `customTags` can end up with two entries for one id
 * and `elementTags` with two assignments of one tag to one element. Readers
 * keep the first of each; the next write of the list stores the cleaned
 * copy. The MCP tools read them the same way
 * (`backend/src/mcp/tools/tag-store.ts`).
 */

/** One definition per tag id, the first. */
export function uniqueTagDefinitions(tags: TagDefinition[]): TagDefinition[] {
  const seen = new Set<string>();
  return tags.filter(tag => {
    if (!tag || typeof tag.id !== 'string' || seen.has(tag.id)) return false;
    seen.add(tag.id);
    return true;
  });
}

/** One assignment per element and tag, the first. */
export function uniqueElementTags(assignments: ElementTag[]): ElementTag[] {
  const seen = new Set<string>();
  return assignments.filter(assignment => {
    if (!assignment) return false;
    const key = `${assignment.elementId}\u0000${assignment.tagId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
