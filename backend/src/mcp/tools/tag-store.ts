/**
 * Project tags as the app stores them, for the MCP tag tools.
 *
 * Tags live in two arrays of the project elements doc
 * (`username:slug:elements/`), the ones the frontend's `TagService` reads:
 *
 * - `customTags`: the project's tag definitions (`{ id, name, icon, color, description? }`).
 * - `elementTags`: one entry per tag on an element (`{ id, elementId, tagId, createdAt }`).
 *
 * Everything here works on a `Y.Doc`, so the tools can read and write it in
 * one transaction on either runtime (`openEditableDocument`).
 */

import { nanoid } from 'nanoid';
import type * as Y from 'yjs';

/** A tag definition, as in the frontend's `TagDefinition`. Unknown properties are kept. */
export interface TagDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  [prop: string]: unknown;
}

/** A tag on an element, as in the frontend's `ElementTag`. */
export interface ElementTag {
  id: string;
  elementId: string;
  tagId: string;
  createdAt: string;
}

/**
 * The icons the tag editor offers (Material icon names). Mirrors
 * `ICON_OPTIONS` in `frontend/src/app/dialogs/tag-edit-dialog/tag-edit-dialog.component.ts`;
 * keep the two in step.
 */
export const TAG_ICONS = [
  'star',
  'whatshot',
  'group',
  'person_outline',
  'school',
  'face',
  'face_3',
  'person',
  'people',
  'check_circle',
  'pending',
  'construction',
  'edit_note',
  'hourglass_empty',
  'schedule',
  'update',
  'priority_high',
  'place',
  'bolt',
  'auto_awesome',
  'archive',
  'flag',
  'bookmark',
  'push_pin',
  'label',
  'local_offer',
  'category',
  'folder',
  'description',
  'article',
  'note',
  'lightbulb',
  'psychology',
  'memory',
  'visibility',
  'favorite',
  'mood',
  'sentiment_satisfied',
  'sentiment_dissatisfied',
  'emoji_objects',
] as const;

/**
 * The colours the tag editor offers. Mirrors `COLOR_OPTIONS` in
 * `frontend/src/app/dialogs/tag-edit-dialog/tag-edit-dialog.component.ts`;
 * keep the two in step.
 */
export const TAG_COLORS = [
  { hex: '#DC143C', name: 'crimson' },
  { hex: '#B22222', name: 'firebrick' },
  { hex: '#FF4500', name: 'orange red' },
  { hex: '#FF8C00', name: 'dark orange' },
  { hex: '#228B22', name: 'forest green' },
  { hex: '#2E8B57', name: 'sea green' },
  { hex: '#20B2AA', name: 'light sea green' },
  { hex: '#4682B4', name: 'steel blue' },
  { hex: '#1E90FF', name: 'dodger blue' },
  { hex: '#4169E1', name: 'royal blue' },
  { hex: '#8A2BE2', name: 'blue violet' },
  { hex: '#9400D3', name: 'dark violet' },
  { hex: '#9370DB', name: 'medium purple' },
  { hex: '#708090', name: 'slate gray' },
  { hex: '#607D8B', name: 'blue gray' },
  { hex: '#A0522D', name: 'sienna' },
] as const;

/** Thrown inside a document edit to abort it with a tool error, before anything is written. */
export class TagToolError extends Error {}

export function isTagDefinition(value: unknown): value is TagDefinition {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as TagDefinition).id === 'string' &&
    typeof (value as TagDefinition).name === 'string'
  );
}

function isElementTag(value: unknown): value is ElementTag {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ElementTag).elementId === 'string' &&
    typeof (value as ElementTag).tagId === 'string'
  );
}

/** Key of an assignment: an element carries each tag at most once. */
function assignmentKey(a: ElementTag): string {
  return `${a.elementId}\u0000${a.tagId}`;
}

/**
 * The tag definitions, one per id (the first wins). Copies of the document
 * edited apart (a Worker's copy, another client) can merge into two entries
 * with one id; readers must not see both.
 */
export function readTagDefinitions(doc: Y.Doc): TagDefinition[] {
  const seen = new Set<string>();
  return doc
    .getArray<unknown>('customTags')
    .toArray()
    .filter((t): t is TagDefinition => {
      if (!isTagDefinition(t) || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
}

/** The tag assignments, one per element and tag (the first wins), for the same reason. */
export function readElementTags(doc: Y.Doc): ElementTag[] {
  const seen = new Set<string>();
  return doc
    .getArray<unknown>('elementTags')
    .toArray()
    .filter((a): a is ElementTag => {
      if (!isElementTag(a) || seen.has(assignmentKey(a))) return false;
      seen.add(assignmentKey(a));
      return true;
    });
}

/**
 * Delete the duplicates `readTagDefinitions` and `readElementTags` skip, so a
 * merge that produced them is cleaned up by the next tag write. Returns how
 * many entries were removed.
 */
export function compactTags(doc: Y.Doc): number {
  const ids = new Set<string>();
  const removedDefinitions = deleteWhere(doc.getArray<unknown>('customTags'), (t) => {
    if (!isTagDefinition(t)) return false;
    if (ids.has(t.id)) return true;
    ids.add(t.id);
    return false;
  });
  const keys = new Set<string>();
  const removedAssignments = deleteWhere(doc.getArray<unknown>('elementTags'), (a) => {
    if (!isElementTag(a)) return false;
    const key = assignmentKey(a);
    if (keys.has(key)) return true;
    keys.add(key);
    return false;
  });
  return removedDefinitions + removedAssignments;
}

/** The ids of the project's elements, from the `elements` array of the same doc. */
export function readElementIds(doc: Y.Doc): Set<string> {
  const ids = new Set<string>();
  for (const value of doc.getArray<unknown>('elements').toArray()) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

/** A tag's public shape in tool results. */
export function presentTag(tag: TagDefinition): Record<string, unknown> {
  return {
    id: tag.id,
    name: tag.name,
    icon: tag.icon,
    color: tag.color,
    ...(tag.description ? { description: tag.description } : {}),
  };
}

/** The tags on `elementId`, resolved to their definitions (dangling assignments skipped). */
export function tagsForElement(
  definitions: TagDefinition[],
  assignments: ElementTag[],
  elementId: string
): TagDefinition[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  return assignments
    .filter((a) => a.elementId === elementId)
    .flatMap((a) => {
      const definition = byId.get(a.tagId);
      return definition ? [definition] : [];
    });
}

function availableTagsHint(definitions: TagDefinition[]): string {
  if (definitions.length === 0) {
    return 'This project has no tags yet: create them with create_tag first.';
  }
  const names = definitions.map((d) => `"${d.name}" (${d.id})`).join(', ');
  return `Available tags: ${names}. Create new ones with create_tag first.`;
}

/**
 * Find the tag a reference names: its id, or else its name ignoring case.
 * Throws `TagToolError` (listing the project's tags) when none matches.
 */
export function resolveTag(definitions: TagDefinition[], ref: string): TagDefinition {
  const trimmed = ref.trim();
  const byId = definitions.find((d) => d.id === trimmed);
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  const byName = definitions.find((d) => d.name.trim().toLowerCase() === lower);
  if (byName) return byName;
  throw new TagToolError(`no tag "${ref}" in this project. ${availableTagsHint(definitions)}`);
}

/** Resolve every reference, reporting all unknown ones at once. */
export function resolveTags(definitions: TagDefinition[], refs: string[]): TagDefinition[] {
  const missing: string[] = [];
  const found: TagDefinition[] = [];
  for (const ref of refs) {
    try {
      const tag = resolveTag(definitions, ref);
      if (!found.some((t) => t.id === tag.id)) found.push(tag);
    } catch {
      missing.push(ref);
    }
  }
  if (missing.length > 0) {
    const list = missing.map((m) => `"${m}"`).join(', ');
    throw new TagToolError(
      `${missing.length === 1 ? 'tag' : 'tags'} ${list} ${missing.length === 1 ? 'does' : 'do'} not exist in this project. ${availableTagsHint(definitions)}`
    );
  }
  return found;
}

/** Normalize an icon argument, or throw listing the allowed icons. */
export function normalizeIcon(icon: string): string {
  const value = icon.trim();
  if ((TAG_ICONS as readonly string[]).includes(value)) return value;
  throw new TagToolError(`icon "${icon}" is not one of the tag icons: ${TAG_ICONS.join(', ')}`);
}

/** Normalize a colour argument (hex or palette name), or throw listing the palette. */
export function normalizeColor(color: string): string {
  const value = color.trim().toLowerCase();
  const match = TAG_COLORS.find((c) => c.hex.toLowerCase() === value || c.name === value);
  if (match) return match.hex;
  const palette = TAG_COLORS.map((c) => `${c.hex} (${c.name})`).join(', ');
  throw new TagToolError(`color "${color}" is not one of the tag colours: ${palette}`);
}

/** Throw when another tag already has `name` (ignoring case). */
export function assertNameFree(
  definitions: TagDefinition[],
  name: string,
  exceptId?: string
): void {
  const lower = name.trim().toLowerCase();
  const clash = definitions.find((d) => d.id !== exceptId && d.name.trim().toLowerCase() === lower);
  if (clash) {
    throw new TagToolError(`a tag named "${clash.name}" already exists (id ${clash.id})`);
  }
}

/** Delete the items matching `predicate`, last first so indices stay valid. */
export function deleteWhere<T>(array: Y.Array<T>, predicate: (item: T) => boolean): number {
  const indices = array
    .toArray()
    .flatMap((item, index) => (predicate(item) ? [index] : []))
    .reverse();
  for (const index of indices) array.delete(index, 1);
  return indices.length;
}

/** Add `tagIds` to `elementId`, skipping ones it already has. Returns how many were added. */
export function addElementTags(doc: Y.Doc, elementId: string, tagIds: string[]): number {
  const array = doc.getArray<ElementTag>('elementTags');
  const existing = new Set(
    readElementTags(doc)
      .filter((a) => a.elementId === elementId)
      .map((a) => a.tagId)
  );
  const createdAt = new Date().toISOString();
  const additions = tagIds
    .filter((tagId) => !existing.has(tagId))
    .map((tagId) => ({ id: nanoid(), elementId, tagId, createdAt }));
  if (additions.length > 0) array.push(additions);
  return additions.length;
}

/** Remove `tagIds` from `elementId` (every one when `tagIds` is undefined). */
export function removeElementTags(doc: Y.Doc, elementId: string, tagIds?: string[]): number {
  const remove = tagIds ? new Set(tagIds) : null;
  return deleteWhere(
    doc.getArray<ElementTag>('elementTags'),
    (a) => isElementTag(a) && a.elementId === elementId && (!remove || remove.has(a.tagId))
  );
}

/** Remove every tag from the given elements (e.g. after deleting them). */
export function removeTagsOfElements(doc: Y.Doc, elementIds: Iterable<string>): number {
  const ids = new Set(elementIds);
  return deleteWhere(
    doc.getArray<ElementTag>('elementTags'),
    (a) => isElementTag(a) && ids.has(a.elementId)
  );
}

export function newTagId(): string {
  return nanoid();
}
