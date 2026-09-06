/**
 * Scene Metadata Model
 *
 * Prose documents (`ElementType.Item`) can play one of two roles:
 *
 *  - `scene`: manuscript prose. Carries structural metadata (synopsis, draft
 *    status, word target, story date) that powers the corkboard, outline
 *    views and continuity tooling.
 *  - `note`: everything else written in prose — research, brainstorming,
 *    front matter, to-do lists. Same editor, no manuscript metadata, and
 *    excluded from publish plans by default.
 *
 * A document with no role is a legacy document created before roles existed.
 * It behaves like a note in the UI but still publishes, so nothing changes
 * for existing projects.
 *
 * All values live in the element's `metadata` string map, which already
 * syncs via Yjs, round-trips through project archives and needs no API
 * change. POV character and location are *not* stored here — they are
 * relationships (see `scene-relationship-types.ts`) so backlinks work.
 */

import type { TimePoint } from './time-system';

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** The role a prose document plays in the project. */
export type DocumentRole = 'scene' | 'note';

/** Draft status of a scene, in progression order. */
export type SceneStatus = 'idea' | 'draft' | 'revised' | 'final';

/** All statuses in progression order — drives pickers and Kanban columns. */
export const SCENE_STATUSES: readonly SceneStatus[] = [
  'idea',
  'draft',
  'revised',
  'final',
];

/** Material icon shown in the tree for each role. */
export const DOCUMENT_ROLE_ICONS: Readonly<Record<DocumentRole, string>> = {
  scene: 'auto_stories',
  note: 'sticky_note_2',
};

/** Element metadata keys used by this model. */
export const SCENE_METADATA_KEYS = {
  role: 'role',
  synopsis: 'synopsis',
  status: 'status',
  wordTarget: 'wordTarget',
  storyDate: 'storyDate',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Typed view
// ─────────────────────────────────────────────────────────────────────────────

/** Structural metadata of a scene, decoded from the element metadata map. */
export interface SceneMetadata {
  role: DocumentRole | undefined;
  synopsis: string;
  status: SceneStatus | undefined;
  /** Target word count; undefined when not set. */
  wordTarget: number | undefined;
  /** In-world date the scene takes place; undefined when not set. */
  storyDate: TimePoint | undefined;
}

type MetadataMap = Readonly<Record<string, string>> | undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Readers — tolerant of missing, empty or garbage values
// ─────────────────────────────────────────────────────────────────────────────

function isDocumentRole(value: unknown): value is DocumentRole {
  return value === 'scene' || value === 'note';
}

function isSceneStatus(value: unknown): value is SceneStatus {
  return (SCENE_STATUSES as readonly unknown[]).includes(value);
}

/** Role of a document, or undefined for legacy documents without one. */
export function getDocumentRole(
  metadata: MetadataMap
): DocumentRole | undefined {
  const raw = metadata?.[SCENE_METADATA_KEYS.role];
  return isDocumentRole(raw) ? raw : undefined;
}

/** True only when the document has explicitly been marked as a scene. */
export function isScene(metadata: MetadataMap): boolean {
  return getDocumentRole(metadata) === 'scene';
}

/** True only when the document has explicitly been marked as a note. */
export function isNote(metadata: MetadataMap): boolean {
  return getDocumentRole(metadata) === 'note';
}

/**
 * Whether a document should be included in publishing by default.
 * Scenes and legacy role-less documents publish; notes do not.
 */
export function isPublishableByDefault(metadata: MetadataMap): boolean {
  return !isNote(metadata);
}

export function getSceneStatus(metadata: MetadataMap): SceneStatus | undefined {
  const raw = metadata?.[SCENE_METADATA_KEYS.status];
  return isSceneStatus(raw) ? raw : undefined;
}

export function getSceneSynopsis(metadata: MetadataMap): string {
  return metadata?.[SCENE_METADATA_KEYS.synopsis] ?? '';
}

/** Word target as a positive integer, or undefined when unset or invalid. */
export function getSceneWordTarget(metadata: MetadataMap): number | undefined {
  const raw = metadata?.[SCENE_METADATA_KEYS.wordTarget];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

/** Story date decoded from JSON, or undefined when unset or malformed. */
export function getSceneStoryDate(
  metadata: MetadataMap
): TimePoint | undefined {
  const raw = metadata?.[SCENE_METADATA_KEYS.storyDate];
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as TimePoint).systemId === 'string' &&
      Array.isArray((parsed as TimePoint).units) &&
      (parsed as TimePoint).units.every(u => typeof u === 'string')
    ) {
      return parsed as TimePoint;
    }
  } catch {
    // fall through — treat unparseable values as unset
  }
  return undefined;
}

/** Decode every scene field at once. */
export function readSceneMetadata(metadata: MetadataMap): SceneMetadata {
  return {
    role: getDocumentRole(metadata),
    synopsis: getSceneSynopsis(metadata),
    status: getSceneStatus(metadata),
    wordTarget: getSceneWordTarget(metadata),
    storyDate: getSceneStoryDate(metadata),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Writers — produce partial metadata maps to merge with updateElementMetadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata written when a document is created with, or converted to, a role.
 * Sets the tree icon alongside the role so the manuscript reads visually.
 */
export function roleMetadata(role: DocumentRole): Record<string, string> {
  return {
    [SCENE_METADATA_KEYS.role]: role,
    icon: DOCUMENT_ROLE_ICONS[role],
  };
}

/**
 * Encode a partial set of scene fields for merging into element metadata.
 * `undefined` fields are skipped; `null` clears a field (written as '').
 */
export function sceneMetadataPatch(
  fields: Partial<{
    synopsis: string | null;
    status: SceneStatus | null;
    wordTarget: number | null;
    storyDate: TimePoint | null;
  }>
): Record<string, string> {
  const patch: Record<string, string> = {};

  if (fields.synopsis !== undefined) {
    patch[SCENE_METADATA_KEYS.synopsis] = fields.synopsis ?? '';
  }
  if (fields.status !== undefined) {
    patch[SCENE_METADATA_KEYS.status] = fields.status ?? '';
  }
  if (fields.wordTarget !== undefined) {
    patch[SCENE_METADATA_KEYS.wordTarget] =
      fields.wordTarget && fields.wordTarget > 0
        ? String(Math.floor(fields.wordTarget))
        : '';
  }
  if (fields.storyDate !== undefined) {
    patch[SCENE_METADATA_KEYS.storyDate] = fields.storyDate
      ? JSON.stringify(fields.storyDate)
      : '';
  }

  return patch;
}
